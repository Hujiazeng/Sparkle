import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { maskSkyHumanToken, SKYHUMAN_TOKEN_KEY } from '@/lib/skyhuman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = getSetting(SKYHUMAN_TOKEN_KEY) || '';
    return NextResponse.json({
      settings: {
        skyhuman_api_token: maskSkyHumanToken(token),
        configured: !!token,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read digital human settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body?.settings?.skyhuman_api_token ?? '').trim();

    if (token && !token.startsWith('***')) {
      setSetting(SKYHUMAN_TOKEN_KEY, token);
    } else if (!token) {
      setSetting(SKYHUMAN_TOKEN_KEY, '');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save digital human settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
