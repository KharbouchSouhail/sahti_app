import { z } from 'zod';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';
import { isExpired, normalizeCode, sha256 } from '@/lib/tokens';
import { clearRateLimit, isRateLimited, rateLimitKey, registerFailure } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';

const schema = z.object({ code: z.string().min(1).max(40) });

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const key = rateLimitKey(session.user.id, 'claim');
    const limit = isRateLimited(key);
    if (limit.limited) throw new ApiError('RATE_LIMITED', 429);

    const body = await parseJson(request, schema);
    const patient = await currentPatient(session.user.id);

    const code = normalizeCode(body.code);
    if (!code) {
      registerFailure(key);
      throw new ApiError('CLAIM_INVALID', 404);
    }

    try {
      const claim = await prisma.claimCode.findUnique({
        where: { codeHash: sha256(code) },
        include: {
          consultation: {
            include: { doctor: { include: { user: { select: { fullName: true, locale: true } } } } },
          },
        },
      });

      if (!claim) {
        throw new ApiError('CLAIM_INVALID', 404);
      }
      if (claim.usedAt) {
        throw new ApiError('CLAIM_USED', 409);
      }
      if (isExpired(claim.expiresAt)) {
        throw new ApiError('CLAIM_EXPIRED', 410);
      }
      if (claim.consultation.status !== 'COMPLETED' || claim.consultation.patientId) {
        throw new ApiError('CLAIM_INVALID', 409);
      }

      const linked = await prisma.$transaction(async (tx) => {
        const consumed = await tx.claimCode.updateMany({
          where: { id: claim.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) throw new ApiError('CLAIM_USED', 409);

        const updated = await tx.consultation.updateMany({
          where: {
            id: claim.consultationId,
            patientId: null,
            status: 'COMPLETED',
          },
          data: {
            patientId: patient.id,
            status: 'LINKED',
            linkedAt: new Date(),
            linkMethod: 'DOCTOR_CODE',
          },
        });
        if (updated.count === 0) throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);

        return tx.consultation.findUnique({
          where: { id: claim.consultationId },
          select: { id: true, consultedAt: true },
        });
      });

      const patientUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { locale: true },
      });
      const doctorName = claim.consultation.doctor.user.fullName;
      const isAr = patientUser?.locale === 'ar';
      await createNotification({
        userId: session.user.id,
        title: isAr ? 'تمت إضافة استشارة جديدة' : 'Nouvelle consultation ajoutée',
        body: isAr
          ? `${doctorName} أضاف استشارة جديدة إلى ملفك.`
          : `${doctorName} a ajouté une consultation à votre dossier.`,
        href: linked ? `/patient/consultations/${linked.id}` : '/patient/consultations',
      });

      await logAudit({
        userId: session.user.id,
        action: 'CLAIM_SUCCESS',
        entityType: 'Consultation',
        entityId: claim.consultationId,
        meta: { method: 'DOCTOR_CODE' },
      });

      clearRateLimit(key);
      return {
        consultationId: claim.consultationId,
        linkedAt: linked?.consultedAt ?? new Date(),
      };
    } catch (error) {
      registerFailure(key);
      throw error;
    }
  });
}
