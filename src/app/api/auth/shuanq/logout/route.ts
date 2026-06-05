import { NextResponse } from 'next/server';
import { clearShuanQSession } from '@/lib/shuanq/service';

export async function POST() {
  const status = clearShuanQSession('已退出登录');
  return NextResponse.json({ status });
}
