import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
import { logAudit } from '@/lib/audit';
import { checkRegenerateLimit } from '@/lib/ai/regenerate-limit';
import { runSectionExtraction } from '@/lib/ai/extraction/provider';
import {
  EXTRACTION_FIELDS,
  type AiMeta,
  type ExtractionData,
  type TranscriptSegment,
} from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  field: z.enum(EXTRACTION_FIELDS),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const limit = checkRegenerateLimit(`regenerate:${session.user.id}`);
    if (!limit.allowed) {
      throw new ApiError('RATE_LIMITED', 429);
    }

    const body = await parseJson(request, schema);

    const [transcript, extraction] = await Promise.all([
      prisma.transcript.findUnique({ where: { consultationId: params.id } }),
      prisma.aiExtraction.findFirst({
        where: { consultationId: params.id, status: 'DRAFT' },
        orderBy: { version: 'desc' },
      }),
    ]);
    if (!transcript) throw new ApiError('TRANSCRIPT_NOT_FOUND', 404);
    if (transcript.purgedAt) throw new ApiError('TRANSCRIPT_PURGED', 410);
    if (!extraction) throw new ApiError('EXTRACTION_NOT_FOUND', 404);

    const segments = (transcript.segments ?? []) as unknown as TranscriptSegment[];
    if (segments.length === 0) throw new ApiError('TRANSCRIPT_EMPTY', 422);

    const result = await runSectionExtraction({
      field: body.field,
      segments,
      language: transcript.language,
    });

    const data = extraction.data as unknown as ExtractionData;
    const next: ExtractionData = {
      ...data,
      [body.field]: { value: result.value, evidence: result.evidence },
    };
    next.missingFields = EXTRACTION_FIELDS.filter((field) => !next[field].value.trim());

    const meta = ((await prisma.consultation.findUnique({
      where: { id: params.id },
      select: { aiMeta: true },
    }))?.aiMeta ?? {}) as unknown as AiMeta;

    const unverified = new Set(meta.unverifiedFields ?? []);
    if (result.unverified) unverified.add(body.field);
    else unverified.delete(body.field);

    const nextMeta: AiMeta = {
      ...meta,
      fieldSources: {
        ...(meta.fieldSources ?? {}),
        [body.field]: result.evidence,
      },
      unverifiedFields: [...unverified],
      regeneratedSections: [
        ...new Set([...(meta.regeneratedSections ?? []), body.field]),
      ],
    };

    await prisma.$transaction(async (tx) => {
      await tx.aiExtraction.update({
        where: { id: extraction.id },
        data: {
          data: next as unknown as Prisma.InputJsonValue,
          missingFields: next.missingFields,
          unverifiedFields: [...unverified],
        },
      });
      await tx.consultation.update({
        where: { id: params.id },
        data: { aiMeta: nextMeta as unknown as Prisma.InputJsonValue },
      });
    });

    await logAudit({
      userId: session.user.id,
      action: 'AI_SECTION_REGENERATED',
      entityType: 'Consultation',
      entityId: params.id,
      meta: { field: body.field, unverified: result.unverified, evidence: result.evidence },
    });

    return {
      field: body.field,
      value: result.value,
      evidence: result.evidence,
      unverified: result.unverified,
      warning: result.warning ?? null,
      remaining: limit.remaining,
    };
  });
}
