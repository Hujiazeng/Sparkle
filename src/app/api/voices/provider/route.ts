import { NextRequest, NextResponse } from 'next/server';
import { getDefaultVoiceProvider, normalizeVoiceProvider, setDefaultVoiceProvider } from '@/lib/voice-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ provider: getDefaultVoiceProvider() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = normalizeVoiceProvider(body?.provider);
    setDefaultVoiceProvider(provider);
    return NextResponse.json({ provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存默认语音服务失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
