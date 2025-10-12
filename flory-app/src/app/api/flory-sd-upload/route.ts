import { NextResponse } from 'next/server';
import { espUrl } from '@/lib/esp';

export async function POST(req: Request) {
  try {
    // Forward the multipart body directly to the ESP32 sd upload endpoint.
    // Use streaming (pass the request body through) instead of buffering the whole body
    // which can fail for large folder uploads.
    const headers: Record<string, string> = {};
    const contentType = req.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;
    const contentLength = req.headers.get('content-length');
    let res;
    if (contentLength) {
      headers['Content-Length'] = contentLength;
      // we can stream directly when content-length is known
      // undici (Node's fetch) requires the `duplex` option when sending a stream as body.
      // Cast init to any to avoid TypeScript complaints in this environment.
      const init: any = {
        method: 'POST',
        headers,
        body: req.body,
        duplex: 'half',
      };
      res = await fetch(espUrl('/sd/upload'), init);
    } else {
      // some embedded HTTP servers (ESP32) don't accept chunked transfer encoding.
      // In that case we buffer the incoming body to compute a Content-Length and forward.
      // Be defensive about maximum size to avoid OOM.
      const MAX_BUFFER = 50 * 1024 * 1024; // 50 MB
      const arr = await req.arrayBuffer();
      if (arr.byteLength > MAX_BUFFER) {
        return NextResponse.json({ error: 'Upload too large to proxy; try uploading fewer files at once' }, { status: 413 });
      }
      headers['Content-Length'] = String(arr.byteLength);
      const buf = Buffer.from(arr);
      res = await fetch(espUrl('/sd/upload'), {
        method: 'POST',
        headers,
        body: buf,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: 'ESP32 upload failed', status: res.status, statusText: res.statusText, details: text }, { status: 502 });
    }
    // Try to parse JSON, but be forgiving
    const data = await res.json().catch(async () => {
      const t = await res.text().catch(() => '');
      return { ok: true, _raw: t };
    });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'Server proxy error', message: error?.message, stack: error?.stack }, { status: 502 });
  }
}
