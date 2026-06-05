import { NextResponse } from 'next/server';
import { getShuanQStatus } from '@/lib/shuanq/service';

export async function GET() {
  try {
    const status = await getShuanQStatus();
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read ShuanQ status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
