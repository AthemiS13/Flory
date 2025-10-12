import { NextResponse } from 'next/server';
import { espUrl, ENDPOINTS } from '@/lib/esp';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(espUrl(ENDPOINTS.settings), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await fetch(espUrl(ENDPOINTS.settings));
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch settings from ESP32' }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
