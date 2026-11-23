import { z } from 'zod';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { logAudit } from '@/lib/audit';
import { ownedConsultation } from '@/lib/ai/access';
import { hasRecordingConsent } from '@/lib/ai/consent';
import { maxAudioMinutes } from '@/lib/retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  mimeType: z.string().trim().min(1).max(120).default('audio/webm'),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const consultation = await ownedConsultation(params.id, doctor.id);

    if (consultation.status === 'COMPLETED' || consultation.status === 'LINKED') {
      throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    }

    const consents = await prisma.recordingConsent.findMany({
      where: { consultationId: consultation.id },
      select: { type: true, granted: true },
    });
    if (!hasRecordingConsent(consents)) {
      throw new ApiError('CONSENT_REQUIRED', 422);
    }

    const body = await parseJson(request, schema);
    const existing = await prisma.recording.findUnique({
      where: { consultationId: consultation.id },
    });

    if (existing && existing.status === 'READY' && !existing.deletedAt) {
      return {
        recordingId: existing.id,
        status: existing.status,
        chunkCount: existing.chunkCount,
        maxMinutes: maxAudioMinutes(),
        alreadyFinalized: true,
      };
    }

    const recording = existing
      ? await prisma.recording.update({
          where: { id: existing.id },
          data: {
            status: 'RECORDING',
            mimeType: body.mimeType,
            deletedAt: null,
            storagePath: null,
            error: null,
            startedAt: existing.chunkCount > 0 ? existing.startedAt : new Date(),
          },
        })
      : await prisma.recording.create({
          data: {
            consultationId: consultation.id,
            status: 'RECORDING',
            mimeType: body.mimeType,
          },
        });

    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { status: 'RECORDING' },
    });

    await logAudit({
      userId: session.user.id,
      action: 'RECORDING_STARTED',
      entityType: 'Consultation',
      entityId: consultation.id,
      meta: { recordingId: recording.id, mimeType: body.mimeType },
    });

    return {
      recordingId: recording.id,
      status: recording.status,
      chunkCount: recording.chunkCount,
      maxMinutes: maxAudioMinutes(),
      alreadyFinalized: false,
    };
  });
}
