import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { assertGrant, touchGrant } from '@/lib/access';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Détail en lecture seule d'une consultation du patient (FULL requis). */
export async function GET(
  _request: Request,
  { params }: { params: { patientId: string; consultationId: string } },
) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const grant = await assertGrant(doctor.id, params.patientId, 'FULL');

    const consultation = await prisma.consultation.findFirst({
      where: {
        id: params.consultationId,
        patientId: params.patientId,
        status: 'LINKED',
        hiddenByPatient: false,
      },
      include: {
        doctor: { include: { user: { select: { fullName: true } } } },
        prescriptions: { orderBy: { position: 'asc' } },
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            kind: true,
            createdAt: true,
          },
        },
      },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);

    await touchGrant(grant.id);
    await logAudit({
      userId: session.user.id,
      action: 'PATIENT_FILE_VIEWED',
      entityType: 'Consultation',
      entityId: consultation.id,
      meta: { patientId: params.patientId, scope: grant.scope, section: 'consultation' },
    });

    return {
      id: consultation.id,
      consultedAt: consultation.consultedAt,
      reason: consultation.reason,
      symptoms: consultation.symptoms,
      examination: consultation.examination,
      diagnosis: consultation.diagnosis,
      treatment: consultation.treatment,
      recommendations: consultation.recommendations,
      followUpDate: consultation.followUpDate,
      doctorName: consultation.doctor.user.fullName,
      specialty: consultation.doctor.specialty,
      prescriptions: consultation.prescriptions,
      attachments: consultation.attachments,
      scope: grant.scope,
      expiresAt: grant.expiresAt,
    };
  });
}
