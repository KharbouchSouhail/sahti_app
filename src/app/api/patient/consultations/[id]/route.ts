import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, patientId: patient.id },
      include: {
        doctor: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
        prescriptions: { orderBy: { position: 'asc' } },
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            kind: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        patient: { include: { user: { select: { fullName: true } } } },
      },
    });

    if (!consultation) return null;

    return {
      id: consultation.id,
      consultedAt: consultation.consultedAt,
      createdAt: consultation.createdAt,
      linkedAt: consultation.linkedAt,
      linkMethod: consultation.linkMethod,
      reason: consultation.reason,
      symptoms: consultation.symptoms,
      examination: consultation.examination,
      diagnosis: consultation.diagnosis,
      treatment: consultation.treatment,
      recommendations: consultation.recommendations,
      followUpDate: consultation.followUpDate,
      hiddenByPatient: consultation.hiddenByPatient,
      doctor: {
        fullName: consultation.doctor.user.fullName,
        specialty: consultation.doctor.specialty,
        clinicName: consultation.doctor.clinicName,
        city: consultation.doctor.city,
        avatarUrl: consultation.doctor.user.avatarUrl,
      },
      patient: {
        fullName: consultation.patient?.user.fullName ?? '',
        patientCode: consultation.patient?.patientCode ?? '',
      },
      prescriptions: consultation.prescriptions,
      attachments: consultation.attachments,
    };
  });
}
