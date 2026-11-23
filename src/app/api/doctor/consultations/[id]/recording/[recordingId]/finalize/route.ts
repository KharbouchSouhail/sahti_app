import { z } from 'zod';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
import { hasRecordingConsent } from '@/lib/ai/consent';
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
  { params }: { params: { id: string; recordingId: string } },
) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const recording = await prisma.recording.findFirst({
      where: { id: params.recordingId, consultationId: params.id },
      select: { id: true },
    });
    if (!recording) throw new ApiError('NOT_FOUND', 404);

    const consents = await prisma.recordingConsent.findMany({
      where: { consultationId: params.id },
      select: { type: true, granted: true },
    });
    if (!hasRecordingConsent(consents)) {
      throw new ApiError('CONSENT_REQUIRED', 422);
    }

    const body = await parseJson(request, schema);
    const result = await finalizeRecording({
      consultationId: params.id,
      recordingId: params.recordingId,
      chunkCount: body.chunkCount,
      durationSec: body.durationSec,
      mimeType: body.mimeType,
      userId: session.user.id,
    });

    return result;
  });
}
