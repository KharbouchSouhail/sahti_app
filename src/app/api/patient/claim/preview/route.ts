import { z } from 'zod';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { isExpired, normalizeCode, sha256 } from '@/lib/tokens';

export const runtime = 'nodejs';

async function resolveClaim(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (!code) throw new ApiError('CLAIM_INVALID', 404);

  const claim = await prisma.claimCode.findUnique({
    where: { codeHash: sha256(code) },
    include: {
      consultation: {
        include: { doctor: { include: { user: { select: { fullName: true } } } } },
      },
    },
  });

  if (!claim) throw new ApiError('CLAIM_INVALID', 404);
  if (claim.usedAt) throw new ApiError('CLAIM_USED', 409);
  if (isExpired(claim.expiresAt)) throw new ApiError('CLAIM_EXPIRED', 410);
  if (claim.consultation.status !== 'COMPLETED' || claim.consultation.patientId) {
    throw new ApiError('CLAIM_INVALID', 409);
  }

  return claim;
}

const schema = z.object({ code: z.string().min(1).max(40) });

export async function POST(request: Request) {
  return handle(async () => {
    await requireUser('PATIENT');
    const body = await parseJson(request, schema);
    const claim = await resolveClaim(body.code);

    return {
      consultationId: claim.consultationId,
      doctorName: claim.consultation.doctor.user.fullName,
      specialty: claim.consultation.doctor.specialty,
      date: claim.consultation.consultedAt,
      reason: claim.consultation.reason,
      expiresAt: claim.expiresAt,
    };
  });
}
