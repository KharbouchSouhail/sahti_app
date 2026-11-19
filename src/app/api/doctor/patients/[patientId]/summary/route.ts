import { handle, requireUser } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { assertGrant, touchGrant } from '@/lib/access';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Infos vitales du patient (VITALS ou FULL). Lecture seule. */
export async function GET(_request: Request, { params }: { params: { patientId: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const patient = await prisma.patient.findUnique({
      where: { id: params.patientId },
      include: { user: { select: { fullName: true, locale: true, avatarUrl: true } } },
    });
    if (!patient) throw new ApiError('NOT_FOUND', 404);

    const grant = await assertGrant(doctor.id, patient.id, 'VITALS');
    await touchGrant(grant.id);
    await logAudit({
      userId: session.user.id,
      action: 'PATIENT_FILE_VIEWED',
      entityType: 'Patient',
      entityId: patient.id,
      meta: { patientId: patient.id, scope: grant.scope, section: 'summary' },
    });

    return {
      patientId: patient.id,
      fullName: patient.user.fullName,
      patientCode: patient.patientCode,
      birthDate: patient.birthDate,
      gender: patient.gender,
      bloodType: patient.bloodType,
      allergies: patient.allergies,
      chronicDiseases: patient.chronicDiseases,
      scope: grant.scope,
      expiresAt: grant.expiresAt,
    };
  });
}
