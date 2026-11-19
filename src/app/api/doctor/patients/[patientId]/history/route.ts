import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { assertGrant, touchGrant } from '@/lib/access';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Historique complet (FULL) du patient, tous médecins confondus. Lecture seule. */
export async function GET(request: Request, { params }: { params: { patientId: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 10));

    const grant = await assertGrant(doctor.id, params.patientId, 'FULL');

    const where = {
      patientId: params.patientId,
      status: 'LINKED' as const,
      hiddenByPatient: false,
    };

    const [items, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        orderBy: { consultedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          consultedAt: true,
          reason: true,
          diagnosis: true,
          doctor: {
            select: {
              specialty: true,
              user: { select: { fullName: true } },
            },
          },
        },
      }),
      prisma.consultation.count({ where }),
    ]);

    await touchGrant(grant.id);
    await logAudit({
      userId: session.user.id,
      action: 'PATIENT_FILE_VIEWED',
      entityType: 'Patient',
      entityId: params.patientId,
      meta: { patientId: params.patientId, scope: grant.scope, section: 'history' },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        consultedAt: item.consultedAt,
        reason: item.reason,
        diagnosis: item.diagnosis,
        doctorName: item.doctor.user.fullName,
        specialty: item.doctor.specialty,
      })),
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      scope: grant.scope,
      expiresAt: grant.expiresAt,
    };
  });
}
