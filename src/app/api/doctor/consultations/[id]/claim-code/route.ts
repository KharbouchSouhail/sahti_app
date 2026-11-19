import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { generateClaimCode, claimPayload } from '@/lib/tokens';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, doctorId: doctor.id },
      select: { id: true, status: true, patientId: true },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);
    if (consultation.status !== 'COMPLETED' || consultation.patientId) {
      throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    }

    const pair = generateClaimCode();

    await prisma.$transaction(async (tx) => {
      await tx.claimCode.deleteMany({ where: { consultationId: consultation.id } });
      await tx.claimCode.create({
        data: {
          consultationId: consultation.id,
          codeHash: pair.codeHash,
          expiresAt: pair.expiresAt,
        },
      });
    });

    await logAudit({
      userId: session.user.id,
      action: 'CLAIM_CODE_GENERATED',
      entityType: 'Consultation',
      entityId: consultation.id,
    });

    return {
      code: pair.formattedCode,
      qrPayload: claimPayload(pair.code),
      expiresAt: pair.expiresAt,
      consultationId: consultation.id,
    };
  });
}
