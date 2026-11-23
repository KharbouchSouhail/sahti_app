import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
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

    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { status: 'DRAFT', creationMode: 'MANUAL' },
    });

    await logAudit({
      userId: session.user.id,
      action: 'AI_MANUAL_FALLBACK',
      entityType: 'Consultation',
      entityId: consultation.id,
    });

    return { id: consultation.id, status: 'DRAFT' as const };
  });
}
