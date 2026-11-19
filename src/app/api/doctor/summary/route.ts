import type { Prisma } from '@prisma/client';
import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const base: Prisma.ConsultationWhereInput = { doctorId: doctor.id };

    const [today, drafts, awaiting, linked, total, pendingList, draftList, recent] = await Promise.all([
      prisma.consultation.count({ where: { ...base, consultedAt: { gte: startOfDay, lt: endOfDay } } }),
      prisma.consultation.count({ where: { ...base, status: 'DRAFT' } }),
      prisma.consultation.count({ where: { ...base, status: 'COMPLETED' } }),
      prisma.consultation.count({ where: { ...base, status: 'LINKED', linkedAt: { gte: startOfMonth } } }),
      prisma.consultation.count({ where: base }),
      prisma.consultation.findMany({
        where: { ...base, status: 'COMPLETED' },
        orderBy: { consultedAt: 'desc' },
        take: 4,
        select: { id: true, consultedAt: true, reason: true, diagnosis: true },
      }),
      prisma.consultation.findMany({
        where: { ...base, status: 'DRAFT' },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        select: { id: true, consultedAt: true, reason: true, updatedAt: true },
      }),
      prisma.consultation.findMany({
        where: base,
        orderBy: { consultedAt: 'desc' },
        take: 5,
        include: {
          patient: { include: { user: { select: { fullName: true } } } },
          _count: { select: { attachments: true, prescriptions: true } },
        },
      }),
    ]);

    return {
      doctor: {
        specialty: doctor.specialty,
        clinicName: doctor.clinicName,
        city: doctor.city,
      },
      counts: { today, drafts, awaiting, linked, total },
      pending: pendingList,
      draftList,
      recent: recent.map((item) => ({
        id: item.id,
        consultedAt: item.consultedAt,
        reason: item.reason,
        diagnosis: item.diagnosis,
        status: item.status,
        patientName: item.patient?.user.fullName ?? null,
        documents: item._count.attachments,
        prescriptions: item._count.prescriptions,
      })),
    };
  });
}
