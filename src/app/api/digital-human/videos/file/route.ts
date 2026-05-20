import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { ensureDigitalHumanOutputRoot } from '../../output-root/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path') || '';
  const rootParam = request.nextUrl.searchParams.get('root') || '';
  if (!filePath) {
    return Response.json({ error: '缺少 path。' }, { status: 400 });
  }

  const root = await ensureDigitalHumanOutputRoot(rootParam || undefined);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root + path.sep) || path.extname(resolved).toLowerCase() !== '.mp4') {
    return Response.json({ error: '无权访问该视频文件。' }, { status: 403 });
  }

  try {
    await fs.access(resolved);
    const stat = await fs.stat(resolved);
    const nodeStream = createReadStream(resolved);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer | string) => {
          controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new Response(webStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch {
    return Response.json({ error: '视频文件不存在。' }, { status: 404 });
  }
}
