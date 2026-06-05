import { NextResponse } from 'next/server';
import { heartbeatShuanQOnce } from '@/lib/shuanq/service';

export async function POST() {
  try {
    const status = await heartbeatShuanQOnce();
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '心跳验证失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
