import { NextRequest, NextResponse } from 'next/server';
import { getShuanQCardInfo } from '@/lib/shuanq/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const card = String(body.card || '').trim();
    if (!card) {
      return NextResponse.json({ error: '请输入卡密' }, { status: 400 });
    }
    const result = await getShuanQCardInfo(card);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '卡密查询失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
