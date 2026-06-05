import { NextRequest, NextResponse } from 'next/server';
import { useShuanQCard } from '@/lib/shuanq/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = String(body.account || '').trim();
    const card = String(body.card || '').trim();
    if (!account || !card) {
      return NextResponse.json({ error: '请输入账号和卡密' }, { status: 400 });
    }
    const result = await useShuanQCard(account, card);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '卡密使用失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
