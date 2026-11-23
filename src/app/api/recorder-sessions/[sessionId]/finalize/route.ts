import { z } from 'zod';
import { ApiError, handle, parseJson } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { resolveRecorderSession } from '@/lib/ai/recorder-session';
import { finalizeRecording } from '@/lib/ai/recording';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  chunkCount: z.number().int().min(1).max(20_000),
  durationSec: z.number().int().min(0).max(24 * 3600),
  mimeType: z.string().trim().min(1).max(120).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  return handle(async () => {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const session = await resolveRecorderSession(params.sessionId, token);
    if (!session) throw new ApiError('NOT_FOUND', 404);
    if (session.usedAt) throw new ApiError('SESSION_USED', 409);

    const body = await parseJson(request, schema);

    const consumed = await prisma.recorderSession.updateMany({
      where: { id: session.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw new ApiError('SESSION_USED', 409);

    const result = await finalizeRecording({
      consultationId: session.consultationId,
      recordingId: session.recordingId,
      chunkCount: body.chunkCount,
      durationSec: body.durationSec,
      mimeType: body.mimeType,
      userId: null,
    });

    return result;
  });
}
