import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/** Révoque un accès (le médecin perd immédiatement les droits). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);

    const grant = await prisma.accessGrant.findFirst({
      where: { id: params.id, patientId: patient.id },
    });
    if (!grant) throw new ApiError('NOT_FOUND', 404);

    await prisma.accessGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });

    await logAudit({
      userId: session.user.id,
      action: 'ACCESS_REVOKED',
      entityType: 'AccessGrant',
      entityId: grant.id,
      meta: { patientId: patient.id, scope: grant.scope, doctorId: grant.doctorId },
    });

    return { ok: true };
  });
}
