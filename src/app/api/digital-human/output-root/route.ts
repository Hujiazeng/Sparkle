import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function getDefaultDigitalHumanOutputRoot() {
  return path.join(process.cwd(), 'results');
}

export async function ensureDigitalHumanOutputRoot(root = getDefaultDigitalHumanOutputRoot()) {
  const resolved = path.resolve(root);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

export async function GET() {
  try {
    const path = await ensureDigitalHumanOutputRoot();
    return NextResponse.json({ path });
  } catch (error) {
    const message = error instanceof Error ? error.message : '初始化输出目录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
