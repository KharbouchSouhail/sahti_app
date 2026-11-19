import type { Prisma } from '@prisma/client';
import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query')?.trim() ?? '';
    const doctorId = searchParams.get('doctor') ?? '';
    const filter = searchParams.get('filter') ?? '';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const showHidden = searchParams.get('showHidden') === '1';
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

    const where: Prisma.ConsultationWhereInput = {
      patientId: patient.id,
      hiddenByPatient: showHidden ? undefined : false,
    };

    if (doctorId) where.doctorId = doctorId;

    if (query) {
      where.OR = [
        { reason: { contains: query, mode: 'insensitive' } },
        { diagnosis: { contains: query, mode: 'insensitive' } },
        { doctor: { user: { fullName: { contains: query, mode: 'insensitive' } } } },
      ];
    }

    const now = new Date();
    let gte: Date | undefined;
    let lte: Date | undefined;

    if (filter === 'month') {
      gte = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (filter === 'year') {
      gte = new Date(now.getFullYear(), 0, 1);
    } else {
      if (from) {
        const parsed = new Date(from);
        if (!Number.isNaN(parsed.getTime())) gte = parsed;
      }
      if (to) {
        const parsed = new Date(to);
        if (!Number.isNaN(parsed.getTime())) {
          parsed.setHours(23, 59, 59, 999);
          lte = parsed;
        }
      }
    }

    if (gte || lte) {
      where.consultedAt = { gte, lte };
    }

    const [total, items, doctors] = await Promise.all([
      prisma.consultation.count({ where }),
      prisma.consultation.findMany({
        where,
        orderBy: { consultedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          doctor: { include: { user: { select: { fullName: true } } } },
          _count: { select: { attachments: true, prescriptions: true } },
        },
      }),
      prisma.consultation.findMany({
        where: { patientId: patient.id },
        select: { doctorId: true, doctor: { select: { specialty: true, user: { select: { fullName: true } } } } },
        distinct: ['doctorId'],
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      items: items.map((item) => ({
        id: item.id,
        consultedAt: item.consultedAt,
        reason: item.reason,
        diagnosis: item.diagnosis,
        doctorName: item.doctor.user.fullName,
        specialty: item.doctor.specialty,
        documents: item._count.attachments,
        prescriptions: item._count.prescriptions,
        hidden: item.hiddenByPatient,
        linkedAt: item.linkedAt,
      })),
      doctors: doctors.map((d) => ({
        id: d.doctorId,
        name: d.doctor.user.fullName,
        specialty: d.doctor.specialty,
      })),
    };
  });
}
