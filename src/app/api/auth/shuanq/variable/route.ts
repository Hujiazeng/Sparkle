import { NextRequest, NextResponse } from 'next/server';
import { getShuanQVariableInfo } from '@/lib/shuanq/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const variableName = String(body.variableName || body.variable_name || '').trim();
    if (!variableName) {
      return NextResponse.json({ error: '请输入变量名' }, { status: 400 });
    }
    const result = await getShuanQVariableInfo(variableName);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取变量失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
