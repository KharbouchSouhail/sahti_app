import { z } from 'zod';
import { handle, parseJson } from '@/lib/api';
import { pairRecorderSession } from '@/lib/ai/recorder-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().trim().min(4).max(12),
});

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJson(request, schema);
    const paired = await pairRecorderSession(body.code);
    if (!paired) return { paired: false as const };
    return {
      paired: true as const,
      sessionId: paired.session.id,
      token: paired.token,
    };
  });
}
