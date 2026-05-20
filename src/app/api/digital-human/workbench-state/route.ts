import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WORKBENCH_STATE_KEY = 'digital_human_workbench_state';

export async function GET() {
  try {
    const value = getSetting(WORKBENCH_STATE_KEY) || '';
    if (!value) {
      return NextResponse.json({ state: null });
    }

    return NextResponse.json({ state: JSON.parse(value) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read workbench state';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body.state !== 'object' || Array.isArray(body.state)) {
      return NextResponse.json({ error: 'Invalid workbench state' }, { status: 400 });
    }

    setSetting(WORKBENCH_STATE_KEY, JSON.stringify(body.state));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save workbench state';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
