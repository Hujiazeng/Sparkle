import { NextRequest, NextResponse } from 'next/server';
import { deleteIndexTTSCloudVoice } from '@/lib/indextts-cloud';
import { getDefaultVoiceProvider, normalizeVoiceProvider } from '@/lib/voice-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const provider = normalizeVoiceProvider(request.nextUrl.searchParams.get('provider') || getDefaultVoiceProvider());
    const body = await request.json();
    const voiceId = String(body?.voiceId || body?.id || '').trim();
    if (!voiceId) {
      return NextResponse.json({ error: '缺少音色 ID。' }, { status: 400 });
    }
    if (provider !== 'indextts') {
      return NextResponse.json({ error: '当前语音服务暂不支持删除云端音色。' }, { status: 400 });
    }
    await deleteIndexTTSCloudVoice(voiceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除音色失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
