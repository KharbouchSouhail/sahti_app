import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
import { logAudit } from '@/lib/audit';
import type { TranscriptSegment } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  segments: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        text: z.string().trim().max(8000),
        speaker: z.enum(['DOCTOR', 'PATIENT', 'UNKNOWN']),
      }),
    )
    .max(2000),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const transcript = await prisma.transcript.findUnique({
      where: { consultationId: params.id },
    });
    if (!transcript) throw new ApiError('TRANSCRIPT_NOT_FOUND', 404);

    return {
      id: transcript.id,
      language: transcript.language,
      text: transcript.text,
      segments: transcript.segments,
      provider: transcript.provider,
      model: transcript.model,
      purgedAt: transcript.purgedAt,
      updatedAt: transcript.updatedAt,
    };
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const body = await parseJson(request, patchSchema);
    const transcript = await prisma.transcript.findUnique({
      where: { consultationId: params.id },
    });
    if (!transcript) throw new ApiError('TRANSCRIPT_NOT_FOUND', 404);
    if (transcript.purgedAt) throw new ApiError('TRANSCRIPT_PURGED', 410);

    const existing = (transcript.segments ?? []) as unknown as TranscriptSegment[];
    const byId = new Map(existing.map((segment) => [segment.id, segment]));
    const incoming = new Map(body.segments.map((segment) => [segment.id, segment]));

    const merged: TranscriptSegment[] = existing.map((segment) => {
      const patch = incoming.get(segment.id);
      if (!patch) return segment;
      return { ...segment, text: patch.text, speaker: patch.speaker };
    });

    const text = merged.map((segment) => segment.text).join(' ');

    await prisma.transcript.update({
      where: { id: transcript.id },
      data: {
        segments: merged as unknown as Prisma.InputJsonValue,
        text,
      },
    });

    await logAudit({
      userId: session.user.id,
      action: 'TRANSCRIPT_EDITED',
      entityType: 'Consultation',
      entityId: params.id,
      meta: { segments: body.segments.length },
    });

    return { id: transcript.id, text, segments: merged };
  });
}
