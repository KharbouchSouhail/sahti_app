import { NextResponse } from 'next/server';
import { handle } from '@/lib/api';
import { purgeExpiredData } from '@/lib/retention';
import { resetStaleJobs } from '@/lib/jobs/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'UNAUTHORIZED' } }, { status: 401 });
  }
  return handle(async () => {
    await resetStaleJobs();
    const result = await purgeExpiredData();
    return { ok: true, ...result };
  });
}

export async function GET(request: Request) {
  return POST(request);
}
