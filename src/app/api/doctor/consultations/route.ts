import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const createSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  symptoms: z.string().trim().max(4000).optional(),
});

export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') ?? '';
    const query = searchParams.get('query')?.trim() ?? '';
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

    const where: Prisma.ConsultationWhereInput = { doctorId: doctor.id };
    if (['DRAFT', 'COMPLETED', 'LINKED'].includes(status)) {
      where.status = status as 'DRAFT' | 'COMPLETED' | 'LINKED';
    }
    if (query) {
      where.OR = [
        { reason: { contains: query, mode: 'insensitive' } },
        { diagnosis: { contains: query, mode: 'insensitive' } },
        { patient: { user: { fullName: { contains: query, mode: 'insensitive' } } } },
      ];
    }

    const [total, items, counts] = await Promise.all([
      prisma.consultation.count({ where }),
      prisma.consultation.findMany({
        where,
        orderBy: { consultedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          patient: { include: { user: { select: { fullName: true } } } },
          _count: { select: { attachments: true, prescriptions: true } },
        },
      }),
      prisma.consultation.groupBy({
        by: ['status'],
        where: { doctorId: doctor.id },
        _count: { _all: true },
      }),
    ]);

    const countMap = { DRAFT: 0, COMPLETED: 0, LINKED: 0 };
    for (const row of counts) countMap[row.status] = row._count._all;

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      counts: countMap,
      items: items.map((item) => ({
        id: item.id,
        consultedAt: item.consultedAt,
        createdAt: item.createdAt,
        linkedAt: item.linkedAt,
        reason: item.reason,
        diagnosis: item.diagnosis,
        status: item.status,
        patientName: item.patient?.user.fullName ?? null,
        patientCode: item.patient?.patientCode ?? null,
        documents: item._count.attachments,
        prescriptions: item._count.prescriptions,
      })),
    };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const body = await parseJson(request, createSchema);

    const consultation = await prisma.consultation.create({
      data: {
        doctorId: doctor.id,
        status: 'DRAFT',
        reason: body.reason ?? '',
        symptoms: body.symptoms ?? null,
      },
      select: { id: true, status: true, consultedAt: true },
    });

    await logAudit({
      userId: session.user.id,
      action: 'CONSULTATION_CREATED',
      entityType: 'Consultation',
      entityId: consultation.id,
    });

    return consultation;
  });
}
