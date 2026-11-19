import type { Prisma } from '@prisma/client';
import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);

    const where: Prisma.ConsultationWhereInput = {
      patientId: patient.id,
      hiddenByPatient: false,
    };
    const now = new Date();

    const [total, documents, doctors, last, upcoming, recent, specialtiesRaw] = await Promise.all([
      prisma.consultation.count({ where }),
      prisma.attachment.count({ where: { consultation: where } }),
      prisma.consultation.findMany({ where, select: { doctorId: true }, distinct: ['doctorId'] }),
      prisma.consultation.findFirst({
        where,
        orderBy: { consultedAt: 'desc' },
        include: { doctor: { include: { user: { select: { fullName: true } } } } },
      }),
      prisma.consultation.findFirst({
        where: { ...where, followUpDate: { gte: now } },
        orderBy: { followUpDate: 'asc' },
        include: { doctor: { include: { user: { select: { fullName: true } } } } },
      }),
      prisma.consultation.findMany({
        where,
        orderBy: { consultedAt: 'desc' },
        take: 5,
        include: {
          doctor: { include: { user: { select: { fullName: true } } } },
          _count: { select: { attachments: true, prescriptions: true } },
        },
      }),
      prisma.consultation.findMany({
        where,
        select: { doctor: { select: { specialty: true } } },
      }),
    ]);

    const specialtyCounts = new Map<string, number>();
    for (const row of specialtiesRaw) {
      const key = row.doctor.specialty || '—';
      specialtyCounts.set(key, (specialtyCounts.get(key) ?? 0) + 1);
    }
    const specialties = Array.from(specialtyCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      patient: {
        id: patient.id,
        patientCode: patient.patientCode,
        bloodType: patient.bloodType,
        allergies: patient.allergies,
        chronicDiseases: patient.chronicDiseases,
      },
      counts: {
        consultations: total,
        doctors: doctors.length,
        documents,
      },
      last: last
        ? {
            id: last.id,
            consultedAt: last.consultedAt,
            reason: last.reason,
            diagnosis: last.diagnosis,
            doctorName: last.doctor.user.fullName,
            specialty: last.doctor.specialty,
          }
        : null,
      upcoming: upcoming
        ? {
            id: upcoming.id,
            followUpDate: upcoming.followUpDate,
            reason: upcoming.reason,
            doctorName: upcoming.doctor.user.fullName,
            specialty: upcoming.doctor.specialty,
          }
        : null,
      specialties,
      recent: recent.map((item) => ({
        id: item.id,
        consultedAt: item.consultedAt,
        reason: item.reason,
        diagnosis: item.diagnosis,
        doctorName: item.doctor.user.fullName,
        specialty: item.doctor.specialty,
        documents: item._count.attachments,
        prescriptions: item._count.prescriptions,
        hidden: item.hiddenByPatient,
      })),
    };
  });
}
