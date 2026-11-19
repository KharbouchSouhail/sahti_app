import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Grants du patient (actifs et historique), visibles dans « Accès à mon dossier ». */
export async function GET() {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);
    const now = new Date();

    const grants = await prisma.accessGrant.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: {
          include: { user: { select: { fullName: true } } },
        },
      },
    });

    return {
      items: grants.map((grant) => ({
        id: grant.id,
        scope: grant.scope,
        createdAt: grant.createdAt,
        expiresAt: grant.expiresAt,
        revokedAt: grant.revokedAt,
        lastAccessAt: grant.lastAccessAt,
        accessCount: grant.accessCount,
        active: !grant.revokedAt && grant.expiresAt > now,
        doctor: { fullName: grant.doctor.user.fullName, specialty: grant.doctor.specialty },
      })),
      activeCount: grants.filter((g) => !g.revokedAt && g.expiresAt > now).length,
    };
  });
}
