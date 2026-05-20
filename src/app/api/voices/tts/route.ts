import { NextRequest, NextResponse } from 'next/server';
import { createSkyHumanAudioByTTS, getSkyHumanToken, querySkyHumanAudioTask } from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const body = await request.json();
    const voice = String(body?.voice || '').trim();
    const text = String(body?.text || '').trim();
    const title = String(body?.title || '试听音频').trim();
    if (!voice) {
      return NextResponse.json({ error: '缺少音色标识。' }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: '试听文本不能为空。' }, { status: 400 });
    }

    const taskId = await createSkyHumanAudioByTTS(token, voice, text, title);
    return NextResponse.json({ taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交试听音频失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const taskId = request.nextUrl.searchParams.get('taskId') || '';
    if (!taskId) {
      return NextResponse.json({ error: '缺少 taskId。' }, { status: 400 });
    }

    const data = await querySkyHumanAudioTask(token, taskId);
    const payload = typeof data.data === 'object' && data.data !== null
      ? data.data as Record<string, unknown>
      : data as Record<string, unknown>;
    return NextResponse.json({
      taskId,
      status: payload.status,
      audioUrl: payload.audio_url || payload.audioUrl || '',
      duration: payload.duration || 0,
      message: payload.message || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询试听音频失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
