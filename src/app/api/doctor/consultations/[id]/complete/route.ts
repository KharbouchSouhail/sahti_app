import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, doctorId: doctor.id },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);
    if (consultation.status === 'LINKED') throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);

    const hasReason = consultation.reason.trim().length > 0;
    const hasDiagnosis = Boolean(consultation.diagnosis?.trim());
    const hasPlan =
      Boolean(consultation.treatment?.trim()) || Boolean(consultation.recommendations?.trim());

    if (!hasReason || !hasDiagnosis || !hasPlan) {
      throw new ApiError('COMPLETE_REQUIRED', 422);
    }

    if (consultation.status !== 'COMPLETED') {
      await prisma.consultation.update({
        where: { id: consultation.id },
        data: { status: 'COMPLETED' },
      });
      await logAudit({
        userId: session.user.id,
        action: 'CONSULTATION_COMPLETED',
        entityType: 'Consultation',
        entityId: consultation.id,
      });
    }

    return { id: consultation.id, status: 'COMPLETED' as const };
  });
}
