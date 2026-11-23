import type { Prisma } from '@prisma/client';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { logAudit } from '@/lib/audit';
import { computeEditedFields, validateReview } from '@/lib/ai/review';
import {
  buildReviewData,
  fieldSourcesFrom,
  reviewPayloadSchema,
  toReviewPayload,
} from '@/lib/ai/review-schema';
import { audioExpiryDate, deleteRecordingNow } from '@/lib/retention';
import type { AiMeta, ExtractionData, ExtractionWarning } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, doctorId: doctor.id },
      include: {
        transcript: { select: { language: true } },
        recording: { select: { id: true } },
      },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);

    if (consultation.status === 'LINKED') {
      throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    }
    if (consultation.status === 'COMPLETED' && consultation.validatedAt) {
      return { id: consultation.id, status: 'COMPLETED' as const, validatedAt: consultation.validatedAt };
    }

    const extraction = await prisma.aiExtraction.findFirst({
      where: { consultationId: consultation.id, status: 'DRAFT' },
      orderBy: { version: 'desc' },
    });
    if (!extraction) throw new ApiError('EXTRACTION_NOT_FOUND', 404);

    const body = await parseJson(request, reviewPayloadSchema);
    const payload = toReviewPayload(body);
    const errors = validateReview(payload);
    if (errors.length > 0) {
      throw new ApiError(errors[0], 422, errors.join(', '));
    }

    const original = extraction.data as unknown as ExtractionData;
    const next = buildReviewData(original, body);
    const edited = computeEditedFields(original, payload);

    const meta = (consultation.aiMeta ?? {}) as unknown as AiMeta;
    const now = new Date();
    const nextMeta: AiMeta = {
      ...meta,
      provider: extraction.provider,
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      generatedAt: meta.generatedAt ?? extraction.createdAt.toISOString(),
      editedFields: [...new Set([...(meta.editedFields ?? []), ...edited])],
      fieldSources: fieldSourcesFrom(next),
      unverifiedFields: (meta.unverifiedFields ?? []).filter((field) => !edited.includes(field)),
      warnings: (extraction.warnings ?? []) as unknown as ExtractionWarning[],
      language: consultation.transcript?.language ?? meta.language ?? 'fr',
      reviewedAt: now.toISOString(),
      reviewedBy: session.user.id,
    };

    const followUp = body.fields.followUpDate.trim();
    const followUpDate = followUp ? new Date(followUp) : null;

    const retention = await prisma.recordingConsent.findFirst({
      where: { consultationId: consultation.id, type: 'RETENTION', granted: true },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.consultation.update({
        where: { id: consultation.id },
        data: {
          reason: body.fields.reason.trim(),
          symptoms: body.fields.symptoms.trim() || null,
          examination: body.fields.examination.trim() || null,
          diagnosis: body.fields.diagnosis.trim(),
          treatment: body.fields.treatment.trim() || null,
          recommendations: body.fields.recommendations.trim() || null,
          followUpDate,
          status: 'COMPLETED',
          validatedAt: now,
          aiMeta: nextMeta as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.prescription.deleteMany({ where: { consultationId: consultation.id } });
      if (next.prescriptions.length > 0) {
        await tx.prescription.createMany({
          data: next.prescriptions.map((row, index) => ({
            consultationId: consultation.id,
            medication: row.medication,
            dosage: row.dosage,
            frequency: row.frequency,
            duration: row.duration,
            notes: row.notes ?? null,
            position: index,
          })),
        });
      }

      await tx.aiExtraction.update({
        where: { id: extraction.id },
        data: {
          data: next as unknown as Prisma.InputJsonValue,
          missingFields: next.missingFields,
          status: 'VALIDATED',
        },
      });

      if (consultation.recording) {
        await tx.recording.update({
          where: { id: consultation.recording.id },
          data: retention
            ? { expiresAt: audioExpiryDate(now) }
            : { expiresAt: now },
        });
      }
    });

    if (!retention) {
      await deleteRecordingNow(consultation.id, {
        userId: session.user.id,
        reason: 'NO_RETENTION',
      });
    }

    await logAudit({
      userId: session.user.id,
      action: 'CONSULTATION_VALIDATED',
      entityType: 'Consultation',
      entityId: consultation.id,
      meta: {
        editedFields: nextMeta.editedFields,
        warnings: nextMeta.warnings.length,
        unverifiedFields: nextMeta.unverifiedFields,
        audioRetention: Boolean(retention),
      },
    });

    return { id: consultation.id, status: 'COMPLETED' as const, validatedAt: now };
  });
}
