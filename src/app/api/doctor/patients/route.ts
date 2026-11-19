import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Patients avec un accès actif ou un accès expiré récent (30 derniers jours),
 * pour la page « Dossiers patients » du médecin.
 */
export async function GET() {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const grants = await prisma.accessGrant.findMany({
      where: {
        doctorId: doctor.id,
        OR: [
          { expiresAt: { gt: now }, revokedAt: null },
          { expiresAt: { gt: thirtyDaysAgo } },
        ],
      },
      orderBy: { expiresAt: 'desc' },
      include: {
        patient: {
          include: { user: { select: { fullName: true, locale: true } } },
        },
      },
    });

    const items = grants.map((grant) => {
      const active = !grant.revokedAt && grant.expiresAt > now;
      return {
        grantId: grant.id,
        patientId: grant.patientId,
        patientName: grant.patient.user.fullName,
        scope: grant.scope,
        createdAt: grant.createdAt,
        expiresAt: grant.expiresAt,
        revokedAt: grant.revokedAt,
        lastAccessAt: grant.lastAccessAt,
        accessCount: grant.accessCount,
        active,
      };
    });

    return { items, activeCount: items.filter((i) => i.active).length };
  });
}
