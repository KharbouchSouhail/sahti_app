import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prescriptionSchema = z.object({
  medication: z.string().trim().min(1).max(160),
  dosage: z.string().trim().min(1).max(120),
  frequency: z.string().trim().min(1).max(120),
  duration: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).nullable().optional(),
});

const updateSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  symptoms: z.string().trim().max(4000).nullable().optional(),
  examination: z.string().trim().max(6000).nullable().optional(),
  diagnosis: z.string().trim().max(4000).nullable().optional(),
  treatment: z.string().trim().max(6000).nullable().optional(),
  recommendations: z.string().trim().max(6000).nullable().optional(),
  followUpDate: z.string().nullable().optional(),
  prescriptions: z.array(prescriptionSchema).max(30).optional(),
});

async function findOwned(id: string, doctorId: string) {
  const consultation = await prisma.consultation.findFirst({
    where: { id, doctorId },
    include: {
      patient: { include: { user: { select: { fullName: true, email: true } } } },
      doctor: { include: { user: { select: { fullName: true, email: true } } } },
      prescriptions: { orderBy: { position: 'asc' } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, kind: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      claimCode: { select: { expiresAt: true, usedAt: true } },
    },
  });
  if (!consultation) throw new ApiError('NOT_FOUND', 404);
  return consultation;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const consultation = await findOwned(params.id, doctor.id);
    return consultation;
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const existing = await findOwned(params.id, doctor.id);

    if (existing.status === 'LINKED') {
      throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    }

    const body = await parseJson(request, updateSchema);

    let followUpDate: Date | null | undefined;
    if (body.followUpDate !== undefined) {
      if (!body.followUpDate) {
        followUpDate = null;
      } else {
        const parsed = new Date(body.followUpDate);
        if (Number.isNaN(parsed.getTime())) {
          throw new ApiError('VALIDATION', 422, 'Invalid follow-up date');
        }
        followUpDate = parsed;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.update({
        where: { id: existing.id },
        data: {
          reason: body.reason,
          symptoms: body.symptoms,
          examination: body.examination,
          diagnosis: body.diagnosis,
          treatment: body.treatment,
          recommendations: body.recommendations,
          followUpDate,
        },
        select: { id: true, status: true, updatedAt: true },
      });

      if (body.prescriptions) {
        await tx.prescription.deleteMany({ where: { consultationId: existing.id } });
        if (body.prescriptions.length > 0) {
          await tx.prescription.createMany({
            data: body.prescriptions.map((p, index) => ({
              consultationId: existing.id,
              medication: p.medication,
              dosage: p.dosage,
              frequency: p.frequency,
              duration: p.duration,
              notes: p.notes ?? null,
              position: index,
            })),
          });
        }
      }

      return consultation;
    });

    await logAudit({
      userId: session.user.id,
      action: 'CONSULTATION_UPDATED',
      entityType: 'Consultation',
      entityId: existing.id,
      meta: {
        fields: Object.keys(body) as Prisma.InputJsonValue,
      },
    });

    return updated;
  });
}
