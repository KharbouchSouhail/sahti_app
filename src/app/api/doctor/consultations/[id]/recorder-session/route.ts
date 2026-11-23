import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
import { hasRecordingConsent } from '@/lib/ai/consent';
import { createRecorderSession } from '@/lib/ai/recorder-session';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const consents = await prisma.recordingConsent.findMany({
      where: { consultationId: params.id },
      select: { type: true, granted: true },
    });
    if (!hasRecordingConsent(consents)) throw new ApiError('CONSENT_REQUIRED', 422);

    const recording = await prisma.recording.findUnique({
      where: { consultationId: params.id },
    });
    if (!recording) throw new ApiError('RECORDING_NOT_STARTED', 409);
    if (recording.deletedAt) throw new ApiError('AUDIO_DELETED', 410);

    const { session: recorderSession, token, pairingCode } = await createRecorderSession({
      consultationId: params.id,
      recordingId: recording.id,
    });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { locale: true },
    });
    const locale = user?.locale ?? 'fr';
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    await logAudit({
      userId: session.user.id,
      action: 'RECORDER_SESSION_CREATED',
      entityType: 'Consultation',
      entityId: params.id,
      meta: { recorderSessionId: recorderSession.id },
    });

    return {
      sessionId: recorderSession.id,
      token,
      code: pairingCode,
      expiresAt: recorderSession.expiresAt,
      url: `${origin.replace(/\/$/, '')}/${locale}/recorder/${recorderSession.id}?token=${token}`,
    };
  });
}
