import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { ensureDigitalHumanOutputRoot } from '../../output-root/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeFilename(name: string) {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return cleaned || 'digital-human-video.mp4';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const videoUrl = String(body?.videoUrl || '').trim();
    const outputRoot = String(body?.outputRoot || '').trim();
    const batchName = safeFilename(String(body?.batchName || 'batch'));
    const filename = safeFilename(String(body?.filename || '001.mp4'));
    const requestedOutputPath = String(body?.outputPath || '').trim();

    if (!videoUrl) {
      return NextResponse.json({ error: '缺少视频 URL。' }, { status: 400 });
    }

    const root = await ensureDigitalHumanOutputRoot(outputRoot || undefined);
    const batchDir = path.resolve(root, batchName);
    const outputPath = requestedOutputPath
      ? path.resolve(requestedOutputPath)
      : path.resolve(batchDir, filename.toLowerCase().endsWith('.mp4') ? filename : `${filename}.mp4`);
    if (!outputPath.startsWith(root + path.sep)) {
      return NextResponse.json({ error: '输出目录不合法。' }, { status: 400 });
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) {
      return NextResponse.json({ error: `下载视频失败，HTTP ${res.status}` }, { status: 502 });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(outputPath, buffer);

    return NextResponse.json({
      path: outputPath,
      bytes: buffer.length,
      previewUrl: `/api/digital-human/videos/file?path=${encodeURIComponent(outputPath)}&root=${encodeURIComponent(root)}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '下载视频失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
