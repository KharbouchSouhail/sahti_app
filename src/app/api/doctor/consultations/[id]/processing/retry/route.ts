import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
import { enqueueJob, retryFailedJobs } from '@/lib/jobs/queue';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const consultation = await ownedConsultation(params.id, doctor.id);

    if (consultation.status === 'COMPLETED' || consultation.status === 'LINKED') {
      throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    }

    const failedCount = await prisma.processingJob.count({
      where: { consultationId: consultation.id, status: 'FAILED' },
    });

    if (failedCount > 0) {
      await retryFailedJobs(consultation.id);
    } else {
      const transcript = await prisma.transcript.findUnique({
        where: { consultationId: consultation.id },
        select: { id: true },
      });
      const active = await prisma.processingJob.count({
        where: {
          consultationId: consultation.id,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });

      if (active === 0) {
        if (transcript) {
          await enqueueJob({ consultationId: consultation.id, type: 'EXTRACT' });
        } else {
          const recording = await prisma.recording.findUnique({
            where: { consultationId: consultation.id },
            select: { status: true, deletedAt: true },
          });
          if (!recording || recording.deletedAt || recording.status !== 'READY') {
            throw new ApiError('NOTHING_TO_RETRY', 409);
          }
          await enqueueJob({ consultationId: consultation.id, type: 'TRANSCRIBE' });
        }
      }
    }

    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { status: 'PROCESSING' },
    });

    await logAudit({
      userId: session.user.id,
      action: 'AI_RETRY',
      entityType: 'Consultation',
      entityId: consultation.id,
    });

    return { status: 'PROCESSING' as const };
  });
}
