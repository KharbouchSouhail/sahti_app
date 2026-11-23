import type { Prisma, ProcessingJob } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { enqueueJob } from '@/lib/jobs/queue';
import { resolveRecordingPath } from '@/lib/recording-storage';
import { transcribeRecording } from '@/lib/ai/stt';
import { runExtraction } from '@/lib/ai/extraction/provider';
import { PROMPT_VERSION } from '@/lib/ai/extraction/prompt';
import { purgeExpiredData } from '@/lib/retention';
import type { AiMeta, TranscriptSegment } from '@/lib/ai/types';

function jobJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function transcribeJob(job: ProcessingJob) {
  if (!job.consultationId) throw new Error('CONSULTATION_REQUIRED');

  const consultation = await prisma.consultation.findUnique({
    where: { id: job.consultationId },
    include: {
      recording: true,
      doctor: { include: { user: { select: { id: true, locale: true } } } },
    },
  });
  if (!consultation) throw new Error('CONSULTATION_NOT_FOUND');

  const recording = consultation.recording;
  if (!recording || !recording.storagePath) throw new Error('AUDIO_NOT_READY');
  if (recording.deletedAt) throw new Error('AUDIO_DELETED');

  const audioPath = resolveRecordingPath(recording.storagePath);
  const result = await transcribeRecording({
    audioPath,
    mimeType: recording.mimeType,
    languageHint: undefined,
  });

  const transcript = await prisma.transcript.upsert({
    where: { consultationId: consultation.id },
    update: {
      recordingId: recording.id,
      language: result.language,
      text: result.text,
      segments: result.segments as unknown as Prisma.InputJsonValue,
      provider: result.provider,
      model: result.model ?? null,
      purgedAt: null,
    },
    create: {
      consultationId: consultation.id,
      recordingId: recording.id,
      language: result.language,
      text: result.text,
      segments: result.segments as unknown as Prisma.InputJsonValue,
      provider: result.provider,
      model: result.model ?? null,
    },
  });

  if (consultation.status !== 'COMPLETED' && consultation.status !== 'LINKED') {
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { status: 'PROCESSING' },
    });
  }

  const existingExtract = await prisma.processingJob.count({
    where: {
      consultationId: consultation.id,
      type: 'EXTRACT',
      status: { in: ['QUEUED', 'RUNNING'] },
    },
  });
  if (existingExtract === 0) {
    await enqueueJob({
      consultationId: consultation.id,
      type: 'EXTRACT',
      payload: { transcriptProvider: result.provider },
    });
  }

  await logAudit({
    userId: consultation.doctor.user.id,
    action: 'TRANSCRIPTION_COMPLETED',
    entityType: 'Consultation',
    entityId: consultation.id,
    meta: {
      provider: result.provider,
      model: result.model ?? null,
      segments: result.segments.length,
      language: result.language,
    },
  });

  return { transcriptId: transcript.id, segments: result.segments.length };
}

async function extractJob(job: ProcessingJob) {
  if (!job.consultationId) throw new Error('CONSULTATION_REQUIRED');

  const consultation = await prisma.consultation.findUnique({
    where: { id: job.consultationId },
    include: {
      transcript: true,
      doctor: { include: { user: { select: { id: true, locale: true } } } },
    },
  });
  if (!consultation) throw new Error('CONSULTATION_NOT_FOUND');
  if (!consultation.transcript) throw new Error('TRANSCRIPT_NOT_FOUND');

  const segments = (consultation.transcript.segments ?? []) as unknown as TranscriptSegment[];
  if (segments.length === 0) throw new Error('TRANSCRIPT_EMPTY');

  const extraction = await runExtraction({
    segments,
    language: consultation.transcript.language,
  });

  const last = await prisma.aiExtraction.findFirst({
    where: { consultationId: consultation.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const aiMeta: AiMeta = {
    provider: extraction.provider,
    model: extraction.model,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    editedFields: [],
    regeneratedSections: [],
    fieldSources: extraction.fieldSources,
    unverifiedFields: extraction.unverifiedFields,
    warnings: extraction.warnings,
    language: consultation.transcript.language,
  };

  await prisma.$transaction(async (tx) => {
    await tx.aiExtraction.updateMany({
      where: { consultationId: consultation.id, status: 'DRAFT' },
      data: { status: 'SUPERSEDED' },
    });
    await tx.aiExtraction.create({
      data: {
        consultationId: consultation.id,
        transcriptId: consultation.transcript!.id,
        version,
        provider: extraction.provider,
        model: extraction.model,
        promptVersion: PROMPT_VERSION,
        data: extraction.data as unknown as Prisma.InputJsonValue,
        missingFields: extraction.data.missingFields,
        unverifiedFields: extraction.unverifiedFields,
        warnings: extraction.warnings as unknown as Prisma.InputJsonValue,
      },
    });
    if (consultation.status !== 'COMPLETED' && consultation.status !== 'LINKED') {
      await tx.consultation.update({
        where: { id: consultation.id },
        data: {
          status: 'AI_REVIEW',
          aiMeta: aiMeta as unknown as Prisma.InputJsonValue,
        },
      });
    }
  });

  const locale = consultation.doctor.user.locale ?? 'fr';
  await createNotification({
    userId: consultation.doctor.user.id,
    title: 'Brouillon IA prêt à relire',
    body: `La consultation « ${consultation.reason || 'sans motif'} » a été transcrite. Vérifiez chaque information avant validation.`,
    href: `/${locale}/doctor/consultations/${consultation.id}/review`,
  });

  await logAudit({
    userId: consultation.doctor.user.id,
    action: 'AI_DRAFT_READY',
    entityType: 'Consultation',
    entityId: consultation.id,
    meta: {
      provider: extraction.provider,
      model: extraction.model,
      promptVersion: PROMPT_VERSION,
      version,
      warnings: extraction.warnings.length,
      unverifiedFields: extraction.unverifiedFields,
    },
  });

  return {
    version,
    provider: extraction.provider,
    warnings: extraction.warnings.length,
    missingFields: extraction.data.missingFields,
  };
}

async function purgeJob() {
  const result = await purgeExpiredData();
  return result;
}

export async function executeJob(job: ProcessingJob) {
  switch (job.type) {
    case 'TRANSCRIBE':
      return jobJson(await transcribeJob(job));
    case 'EXTRACT':
      return jobJson(await extractJob(job));
    case 'PURGE':
      return jobJson(await purgeJob());
    default:
      throw new Error(`JOB_TYPE_UNKNOWN:${job.type}`);
  }
}
