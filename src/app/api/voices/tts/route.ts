import { NextRequest, NextResponse } from 'next/server';
import { createSkyHumanAudioByTTS, getSkyHumanToken, querySkyHumanAudioTask } from '@/lib/skyhuman';
import { synthesizeIndexTTSCloudAudio } from '@/lib/indextts-cloud';
import { getDefaultVoiceProvider, normalizeVoiceProvider } from '@/lib/voice-provider';
import { getCachedTtsResult, putCachedTtsResult } from '@/lib/voice-tts-result-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const provider = normalizeVoiceProvider(request.nextUrl.searchParams.get('provider') || getDefaultVoiceProvider());
    const token = getSkyHumanToken();
    if (provider === 'skyhuman' && !token) {
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

    if (provider === 'indextts') {
      const result = await synthesizeIndexTTSCloudAudio({
        voiceId: voice,
        text,
        emotion: body?.emotion ? String(body.emotion) : null,
        emoAlpha: Number.isFinite(Number(body?.emo_alpha ?? body?.emoAlpha)) ? Number(body?.emo_alpha ?? body?.emoAlpha) : 0.5,
        speed: Number.isFinite(Number(body?.speed)) ? Number(body.speed) : 1.0,
      });
      if (!result.audioUrl) {
        throw new Error('IndexTTS 未返回音频 URL');
      }
      const taskId = putCachedTtsResult({ audioUrl: result.audioUrl, duration: result.duration });
      return NextResponse.json({ provider, taskId, audioUrl: result.audioUrl, status: 3, duration: result.duration });
    }

    const taskId = await createSkyHumanAudioByTTS(token, voice, text, title);
    return NextResponse.json({ provider, taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交试听音频失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const provider = normalizeVoiceProvider(request.nextUrl.searchParams.get('provider') || getDefaultVoiceProvider());
    const token = getSkyHumanToken();
    if (provider === 'skyhuman' && !token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const taskId = request.nextUrl.searchParams.get('taskId') || '';
    if (!taskId) {
      return NextResponse.json({ error: '缺少 taskId。' }, { status: 400 });
    }

    if (provider === 'indextts' || taskId.startsWith('indextts:')) {
      const result = getCachedTtsResult(taskId);
      if (!result) {
        return NextResponse.json({ error: '试听结果已过期，请重新生成。' }, { status: 404 });
      }
      return NextResponse.json({
        provider: 'indextts',
        taskId,
        status: 3,
        audioUrl: result.audioUrl,
        duration: result.duration,
        message: result.message || '',
      });
    }

    const data = await querySkyHumanAudioTask(token, taskId);
    const payload = typeof data.data === 'object' && data.data !== null
      ? data.data as Record<string, unknown>
      : data as Record<string, unknown>;
    return NextResponse.json({
      taskId,
      provider,
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
