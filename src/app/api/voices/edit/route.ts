import { NextRequest, NextResponse } from 'next/server';
import { editSkyHumanVoice, getSkyHumanToken } from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clampParam(value: unknown, fallback: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return String(Math.max(0.1, Math.min(2, num)));
}

export async function POST(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const body = await request.json();
    const voice = String(body?.voice || '').trim();
    if (!voice) {
      return NextResponse.json({ error: '缺少音色标识。' }, { status: 400 });
    }

    await editSkyHumanVoice(token, voice, {
      title: body?.title !== undefined ? String(body.title || '未命名音色').trim() : undefined,
      rate: body?.rate !== undefined ? clampParam(body.rate, '1.0') : undefined,
      volume: body?.volume !== undefined ? clampParam(body.volume, '1.0') : undefined,
      pitch: body?.pitch !== undefined ? clampParam(body.pitch, '1.0') : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '编辑音色失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
