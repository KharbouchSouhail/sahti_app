import { handle } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { resolveRecorderSession } from '@/lib/ai/recorder-session';
import { maxAudioMinutes } from '@/lib/retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { sessionId: string } }) {
  return handle(async () => {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const session = await resolveRecorderSession(params.sessionId, token);
    if (!session) return { valid: false as const };

    const recording = await prisma.recording.findUnique({
      where: { id: session.recordingId },
      select: { status: true, chunkCount: true, deletedAt: true },
    });

    return {
      valid: true as const,
      consultationId: session.consultationId,
      recordingId: session.recordingId,
      status: recording?.status ?? 'RECORDING',
      chunkCount: recording?.chunkCount ?? 0,
      deleted: Boolean(recording?.deletedAt),
      expiresAt: session.expiresAt,
      maxMinutes: maxAudioMinutes(),
    };
  });
}
