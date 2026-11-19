import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRACKED_ACTIONS = [
  'ACCESS_GRANTED',
  'ACCESS_REVOKED',
  'PATIENT_FILE_VIEWED',
  'FILE_DOWNLOADED',
  'LINK_VIA_GRANT',
] as const;

/** Journal « Qui a consulté mon dossier » du patient. */
export async function GET() {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);
    const patientUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { fullName: true, locale: true },
    });

    const audits = await prisma.auditLog.findMany({
      where: {
        action: { in: [...TRACKED_ACTIONS] },
        meta: { path: ['patientId'], equals: patient.id },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const userIds = [...new Set(audits.map((a) => a.userId).filter((v): v is string => !!v))];
    const doctors = await prisma.doctor.findMany({
      where: { userId: { in: userIds } },
      include: { user: { select: { fullName: true } } },
    });
    const doctorByUserId = new Map(doctors.map((d) => [d.userId, d]));

    return {
      items: audits.map((audit) => {
        const doctor = audit.userId ? doctorByUserId.get(audit.userId) : undefined;
        const isSelf = audit.userId === session.user.id;
        const meta = (audit.meta ?? {}) as unknown as Record<string, unknown>;
        return {
          id: audit.id,
          action: audit.action,
          createdAt: audit.createdAt,
          actorName: isSelf ? patientUser?.fullName ?? null : doctor?.user.fullName ?? null,
          specialty: isSelf ? null : doctor?.specialty ?? null,
          section: (meta.section as string | undefined) ?? null,
          scope: (meta.scope as string | undefined) ?? null,
        };
      }),
    };
  });
}
