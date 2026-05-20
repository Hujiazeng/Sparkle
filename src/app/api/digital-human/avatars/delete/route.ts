import { NextRequest, NextResponse } from 'next/server';
import { deleteSkyHumanAvatar, getSkyHumanToken } from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const body = await request.json();
    const avatarCode = String(body?.avatarCode || '').trim();
    if (!avatarCode) {
      return NextResponse.json({ error: '缺少数字人标识。' }, { status: 400 });
    }

    await deleteSkyHumanAvatar(token, avatarCode);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除数字人失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

