import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  createSkyHumanAudioByTTS,
  createSkyHumanUploadUrl,
  createSkyHumanVideoByAudio,
  getSkyHumanToken,
  querySkyHumanAudioTask,
  querySkyHumanVideoTask,
  uploadBlobToSkyHuman,
  uploadFileToSkyHuman,
} from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readPayload(data: { data?: unknown; [key: string]: unknown }) {
  return typeof data.data === 'object' && data.data !== null
    ? data.data as Record<string, unknown>
    : data as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const formData = await request.formData();
    const source = String(formData.get('source') || 'script');
    const title = String(formData.get('title') || '数字人视频').trim();
    const avatar = String(formData.get('avatar') || '').trim();
    const voice = String(formData.get('voice') || '').trim();
    const script = String(formData.get('script') || '').trim();
    const audioPath = String(formData.get('audioPath') || '').trim();

    if (!avatar) {
      return NextResponse.json({ error: '缺少数字人形象。' }, { status: 400 });
    }

    if (source === 'script') {
      if (!voice) {
        return NextResponse.json({ error: '文案任务缺少音色。' }, { status: 400 });
      }
      if (!script) {
        return NextResponse.json({ error: '文案不能为空。' }, { status: 400 });
      }

      const audioTaskId = await createSkyHumanAudioByTTS(token, voice, script, `${title} 音频`);
      return NextResponse.json({ source, audioTaskId });
    }

    const audioFile = formData.get('audio');
    if (!(audioFile instanceof File) && !audioPath) {
      return NextResponse.json({ error: '请上传音频文件或提供本地音频路径。' }, { status: 400 });
    }

    const extension = audioFile instanceof File
      ? audioFile.name.split('.').pop()?.toLowerCase() || 'mp3'
      : path.extname(audioPath).replace(/^\./, '').toLowerCase() || 'mp3';
    const uploadInfo = await createSkyHumanUploadUrl(token, extension);
    if (audioFile instanceof File) {
      await uploadFileToSkyHuman(uploadInfo, audioFile);
    } else {
      const audioBuffer = await fs.readFile(audioPath);
      await uploadBlobToSkyHuman(uploadInfo, new Blob([audioBuffer], { type: uploadInfo.content_type }), '上传本地音频');
    }
    const videoTaskId = await createSkyHumanVideoByAudio(token, avatar, title, { fileId: uploadInfo.file_id });
    return NextResponse.json({ source, videoTaskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交数字人视频任务失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const kind = request.nextUrl.searchParams.get('kind') || 'video';
    const taskId = request.nextUrl.searchParams.get('taskId') || '';
    if (!taskId) {
      return NextResponse.json({ error: '缺少 taskId。' }, { status: 400 });
    }

    if (kind === 'audio') {
      const data = await querySkyHumanAudioTask(token, taskId);
      const payload = readPayload(data);
      return NextResponse.json({
        kind,
        taskId,
        status: payload.status,
        audioUrl: payload.audio_url || payload.audioUrl || '',
        duration: payload.duration || 0,
        message: payload.message || '',
      });
    }

    const data = await querySkyHumanVideoTask(token, taskId);
    const payload = readPayload(data);
    return NextResponse.json({
      kind,
      taskId,
      status: payload.status,
      videoUrl: payload.video_Url || payload.video_url || payload.videoUrl || '',
      duration: payload.duration || 0,
      message: payload.message || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询数字人视频任务失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ error: '请先配置 SkyHuman API Token。' }, { status: 400 });
    }

    const body = await request.json();
    const avatar = String(body?.avatar || '').trim();
    const title = String(body?.title || '数字人视频').trim();
    const audioUrl = String(body?.audioUrl || '').trim();
    if (!avatar) {
      return NextResponse.json({ error: '缺少数字人形象。' }, { status: 400 });
    }
    if (!audioUrl) {
      return NextResponse.json({ error: '缺少音频 URL。' }, { status: 400 });
    }

    const videoTaskId = await createSkyHumanVideoByAudio(token, avatar, title, { audioUrl });
    return NextResponse.json({ videoTaskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建数字人视频失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
