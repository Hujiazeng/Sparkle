import { NextRequest, NextResponse } from 'next/server';
import {
  createSkyHumanAvatarByFile,
  createSkyHumanUploadUrl,
  getSkyHumanToken,
  listSkyHumanAvatars,
  uploadFileToSkyHuman,
} from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapAvatar(avatar: Awaited<ReturnType<typeof listSkyHumanAvatars>>[number]) {
  return {
    id: String(avatar.id ?? avatar.avatar_code ?? avatar.avatarCode ?? crypto.randomUUID()),
    avatarCode: avatar.avatar_code || avatar.avatarCode || '',
    title: avatar.title || avatar.name || '未命名数字人',
    coverImageUrl: avatar.cover_image_url || avatar.coverImageUrl || avatar.cover_url || avatar.cover || '/buddy/robot.png',
    isFavorite: !!(avatar.is_favorite ?? avatar.isFavorite),
    status: avatar.status || 'ready',
    createdAt: avatar.created_at || avatar.createdAt || '',
    note: '已同步自飞天数字人，可用于后续数字人视频创作。',
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = getSkyHumanToken();
    if (!token) {
      return NextResponse.json({ configured: false, avatars: [] });
    }

    const favoriteOnly = request.nextUrl.searchParams.get('favoriteOnly') === '1';
    const avatars = await listSkyHumanAvatars(token, favoriteOnly);
    return NextResponse.json({ configured: true, avatars: avatars.map(mapAvatar) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取数字人列表失败';
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
    const title = String(formData.get('title') || '未命名数字人').trim();
    const file = formData.get('video');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传克隆视频。' }, { status: 400 });
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const uploadInfo = await createSkyHumanUploadUrl(token, extension);
    await uploadFileToSkyHuman(uploadInfo, file);
    const taskId = await createSkyHumanAvatarByFile(token, title, uploadInfo.file_id);

    return NextResponse.json({ taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建数字人失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
