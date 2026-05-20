import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { getSkyHumanCredit, SKYHUMAN_TOKEN_KEY } from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let token = String(body?.token ?? '').trim();

    if (!token || token.startsWith('***')) {
      token = getSetting(SKYHUMAN_TOKEN_KEY) || '';
    }

    if (!token) {
      return NextResponse.json({ verified: false, error: '请先填写 SkyHuman API Token。' }, { status: 400 });
    }

    const credit = await getSkyHumanCredit(token);
    return NextResponse.json({ verified: true, credit });
  } catch (error) {
    const message = error instanceof Error ? error.message : '验证失败';
    return NextResponse.json({ verified: false, error: message }, { status: 500 });
  }
}

