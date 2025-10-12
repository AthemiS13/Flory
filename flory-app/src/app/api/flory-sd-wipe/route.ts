import { NextResponse } from 'next/server';
import { espUrl } from '@/lib/esp';

export async function POST(req: Request) {
  try {
    // Forward the POST to the ESP32 wipe endpoint with force=1
    const url = espUrl('/sd/wipe?force=1');
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: 'ESP32 wipe failed', status: res.status, details: text }, { status: 502 });
    }
    // forward JSON or raw text
    const data = await res.json().catch(async () => {
      const t = await res.text().catch(() => '');
      return { ok: true, _raw: t };
    });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'Server proxy error', message: error?.message }, { status: 502 });
  }
}
