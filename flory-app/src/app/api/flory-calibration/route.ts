import { NextResponse } from 'next/server';
import { espUrl, ENDPOINTS } from '@/lib/esp';

export async function GET() {
  try {
    const res = await fetch(espUrl(ENDPOINTS.calibration));
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch calibration from ESP32' }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
