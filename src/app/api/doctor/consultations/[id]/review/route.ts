import type { Prisma } from '@prisma/client';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { logAudit } from '@/lib/audit';
import { computeEditedFields } from '@/lib/ai/review';
import {
  buildReviewData,
  fieldSourcesFrom,
  reviewPayloadSchema,
  toReviewPayload,
} from '@/lib/ai/review-schema';
import type { AiMeta, ExtractionData } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, doctorId: doctor.id },
      select: { id: true, status: true, aiMeta: true },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);
    if (consultation.status === 'COMPLETED' || consultation.status === 'LINKED') {
      throw new ApiError('ALREADY_VALIDATED', 409);
    }

    const extraction = await prisma.aiExtraction.findFirst({
      where: { consultationId: consultation.id, status: 'DRAFT' },
      orderBy: { version: 'desc' },
    });
    if (!extraction) throw new ApiError('EXTRACTION_NOT_FOUND', 404);

    const body = await parseJson(request, reviewPayloadSchema);
    const payload = toReviewPayload(body);
    const original = extraction.data as unknown as ExtractionData;
    const next = buildReviewData(original, body);
    const edited = computeEditedFields(original, payload);

    const meta = (consultation.aiMeta ?? {}) as unknown as AiMeta;
    const nextMeta: AiMeta = {
      ...meta,
      editedFields: [...new Set([...(meta.editedFields ?? []), ...edited])],
      fieldSources: fieldSourcesFrom(next),
      unverifiedFields: (meta.unverifiedFields ?? []).filter(
        (field) => !edited.includes(field),
      ),
      reviewedAt: body.reviewed ? new Date().toISOString() : meta.reviewedAt,
    };

    await prisma.$transaction(async (tx) => {
      await tx.aiExtraction.update({
        where: { id: extraction.id },
        data: {
          data: next as unknown as Prisma.InputJsonValue,
          missingFields: next.missingFields,
        },
      });
      await tx.consultation.update({
        where: { id: consultation.id },
        data: { aiMeta: nextMeta as unknown as Prisma.InputJsonValue },
      });
    });

    await logAudit({
      userId: session.user.id,
      action: 'AI_REVIEW_SAVED',
      entityType: 'Consultation',
      entityId: consultation.id,
      meta: { editedFields: edited, reviewed: body.reviewed },
    });

    return {
      savedAt: new Date().toISOString(),
      editedFields: nextMeta.editedFields,
      missingFields: next.missingFields,
    };
  });
}
