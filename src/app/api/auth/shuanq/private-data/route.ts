import { NextRequest, NextResponse } from 'next/server';
import { reviseShuanQPrivateData } from '@/lib/shuanq/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const field = String(body.field || '').trim();
    const content = String(body.content ?? '');
    if (!field) {
      return NextResponse.json({ error: '请输入字段名' }, { status: 400 });
    }
    const result = await reviseShuanQPrivateData(field, content);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '修改私有数据失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
