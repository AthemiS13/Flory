import { NextResponse } from 'next/server';
import { espUrl } from '@/lib/esp';

export async function POST(req: Request) {
  try {
    // Forward restart request to the ESP32
    const res = await fetch(espUrl('/api/restart'), { method: 'POST' });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to restart ESP32' }, { status: 500 });
    }
    // The device typically responds { ok: true } before restarting
    const data = await res.json().catch(() => ({ ok: true }));
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
