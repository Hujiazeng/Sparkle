import { NextRequest, NextResponse } from 'next/server';
import {
  createSkyHumanUploadUrl,
  createSkyHumanVoiceByAudio,
  getSkyHumanToken,
  listSkyHumanVoices,
  uploadFileToSkyHuman,
} from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VoiceRecord = Awaited<ReturnType<typeof listSkyHumanVoices>>[number];

function mapVoice(voice: VoiceRecord, kind: number) {
  return {
    id: String(voice.id ?? voice.voice ?? crypto.randomUUID()),
    voice: voice.voice || '',
    title: voice.title || '未命名音色',
    type: voice.type ?? '',
    rate: String(voice.rate ?? '1.0'),
    volume: String(voice.volume ?? '1.0'),
    pitch: String(voice.pitch ?? '1.0'),
    demoUrl: voice.demo_url || voice.demoUrl || voice.audio_url || voice.audioUrl || '',
    language: voice.language || '',
    kind,
    status: voice.status || 'ready',
    createdAt: voice.created_at || voice.createdAt || '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ configured: false, voices: [] });
    }

    const kindParam = request.nextUrl.searchParams.get('kind') || 'all';
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || '1') || 1);
    const size = Math.min(300, Math.max(1, Number(request.nextUrl.searchParams.get('size') || '120') || 120));
    if (kindParam === '2') {
      const voices = await listSkyHumanVoices(token, 2, page, size);
      return NextResponse.json({ configured: true, voices: voices.map((voice) => mapVoice(voice, 2)) });
    }
    if (kindParam === '1') {
      const voices = await listSkyHumanVoices(token, 1, page, size);
      return NextResponse.json({ configured: true, voices: voices.map((voice) => mapVoice(voice, 1)) });
    }

    const [mine, publicVoices] = await Promise.all([
      listSkyHumanVoices(token, 1, page, size),
      listSkyHumanVoices(token, 2, page, size),
    ]);
    return NextResponse.json({
      configured: true,
      voices: [
        ...mine.map((voice) => mapVoice(voice, 1)),
        ...publicVoices.map((voice) => mapVoice(voice, 2)),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取音色列表失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const formData = await request.formData();
    const title = String(formData.get('title') || '未命名音色').trim();
    const language = String(formData.get('language') || '').trim();
    const file = formData.get('audio');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传参考音频。' }, { status: 400 });
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'wav';
    const uploadInfo = await createSkyHumanUploadUrl(token, extension);
    await uploadFileToSkyHuman(uploadInfo, file);
    const taskId = await createSkyHumanVoiceByAudio(token, title, uploadInfo.file_id, language || undefined);

    return NextResponse.json({ taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建音色失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
