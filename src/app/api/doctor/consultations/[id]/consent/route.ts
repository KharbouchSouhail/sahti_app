import { z } from 'zod';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { logAudit } from '@/lib/audit';
import { ownedConsultation } from '@/lib/ai/access';
import { validateConsent } from '@/lib/ai/consent';
import { getActiveGrant } from '@/lib/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  audio: z.boolean().default(false),
  aiProcessing: z.boolean().default(false),
  retention: z.boolean().default(false),
  patientRefused: z.boolean().default(false),
  patientId: z.string().trim().min(1).max(64).optional(),
  method: z.enum(['DOCTOR_ATTESTATION', 'PATIENT_QR']).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const consultation = await ownedConsultation(params.id, doctor.id);

    if (consultation.status === 'COMPLETED' || consultation.status === 'LINKED') {
      throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    }

    const recording = await prisma.recording.findUnique({
      where: { consultationId: consultation.id },
      select: { status: true, chunkCount: true },
    });
    if (recording && (recording.status === 'READY' || recording.chunkCount > 0)) {
      throw new ApiError('CONSENT_LOCKED', 409);
    }

    const body = await parseJson(request, schema);
    const validation = validateConsent(body);
    if (!validation.ok) throw new ApiError(validation.code, 422);

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined;
    const userAgent = request.headers.get('user-agent') ?? undefined;

    if (validation.manual) {
      await prisma.$transaction(async (tx) => {
        await tx.recordingConsent.deleteMany({ where: { consultationId: consultation.id } });
        await tx.consultation.update({
          where: { id: consultation.id },
          data: { creationMode: 'MANUAL' },
        });
      });
      await logAudit({
        userId: session.user.id,
        action: 'CONSENT_PATIENT_REFUSED',
        entityType: 'Consultation',
        entityId: consultation.id,
        ip,
        meta: { mode: 'MANUAL' },
      });
      return { mode: 'MANUAL' as const, types: [] };
    }

    let patientId: string | null = null;
    if (body.patientId) {
      const grant = await getActiveGrant(doctor.id, body.patientId);
      if (!grant) throw new ApiError('GRANT_REQUIRED', 403);
      patientId = body.patientId;
    }

    const method = body.method ?? 'DOCTOR_ATTESTATION';

    await prisma.$transaction(async (tx) => {
      await tx.recordingConsent.deleteMany({ where: { consultationId: consultation.id } });
      await tx.recordingConsent.createMany({
        data: validation.types.map((type) => ({
          consultationId: consultation.id,
          type,
          granted: true,
          method,
          ip,
          userAgent,
        })),
      });
      if (patientId) {
        await tx.recordingConsent.create({
          data: {
            consultationId: consultation.id,
            type: 'PATIENT_QR',
            granted: true,
            method: 'PATIENT_QR',
            ip,
            userAgent,
          },
        });
      }
      await tx.consultation.update({
        where: { id: consultation.id },
        data: { creationMode: 'AI', patientId },
      });
    });

    await logAudit({
      userId: session.user.id,
      action: 'CONSENT_GIVEN',
      entityType: 'Consultation',
      entityId: consultation.id,
      ip,
      meta: {
        types: validation.types,
        method,
        patientLinked: Boolean(patientId),
      },
    });

    return {
      mode: 'AI' as const,
      types: validation.types,
      patientId,
    };
  });
}
