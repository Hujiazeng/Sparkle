import { NextRequest, NextResponse } from 'next/server';
import { loginShuanQUser } from '@/lib/shuanq/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = String(body.account || '').trim();
    const password = String(body.password || '').trim();
    if (!account || !password) {
      return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 });
    }
    const status = await loginShuanQUser(account, password);
    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
