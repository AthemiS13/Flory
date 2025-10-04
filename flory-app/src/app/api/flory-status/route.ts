import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Change this to your ESP32's IP address
    const res = await fetch('http://192.168.0.28/api/status');
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch from ESP32' }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
