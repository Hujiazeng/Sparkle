import { NextRequest, NextResponse } from 'next/server';
import { registerShuanQUser } from '@/lib/shuanq/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = String(body.account || '').trim();
    const password = String(body.password || '').trim();
    const nickname = String(body.nickname || account).trim();
    if (!account || !password) {
      return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 });
    }
    const result = await registerShuanQUser(account, password, nickname);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
