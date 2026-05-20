import { NextRequest, NextResponse } from 'next/server';
import { getSkyHumanToken, querySkyHumanAvatarTask } from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const data = await querySkyHumanAvatarTask(token, taskId);
    const payload = typeof data.data === 'object' && data.data !== null
      ? data.data as Record<string, unknown>
      : data as Record<string, unknown>;
    return NextResponse.json({
      taskId,
      status: payload.status,
      avatar: payload.avatar,
      message: payload.message || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询数字人任务失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
