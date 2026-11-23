import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { assembleRecording } from '@/lib/recording-storage';
import { enqueueJob } from '@/lib/jobs/queue';
import { maxAudioMinutes } from '@/lib/retention';

export async function finalizeRecording(input: {
  consultationId: string;
  recordingId: string;
  chunkCount: number;
  durationSec: number;
  mimeType?: string;
  userId?: string | null;
}) {
  const recording = await prisma.recording.findFirst({
    where: { id: input.recordingId, consultationId: input.consultationId },
  });
  if (!recording) throw new ApiError('NOT_FOUND', 404);
  if (recording.deletedAt) throw new ApiError('AUDIO_DELETED', 410);

  if (recording.status === 'READY') {
    return { status: 'PROCESSING' as const, recordingId: recording.id, alreadyFinalized: true };
  }

  const limitSeconds = maxAudioMinutes() * 60;
  if (input.durationSec > limitSeconds) {
    throw new ApiError('AUDIO_TOO_LONG', 422);
  }
  if (input.chunkCount <= 0) {
    throw new ApiError('NO_CHUNKS', 422);
  }

  let assembled: { storagePath: string; sizeBytes: number; mimeType: string };
  try {
    assembled = await assembleRecording(
      recording.id,
      input.chunkCount,
      input.mimeType ?? recording.mimeType,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'CHUNK_MISSING') {
      throw new ApiError('CHUNK_MISSING', 409);
    }
    if (error instanceof Error && error.message === 'NO_CHUNKS') {
      throw new ApiError('NO_CHUNKS', 422);
    }
    throw error;
  }

  await prisma.recording.update({
    where: { id: recording.id },
    data: {
      status: 'READY',
      storagePath: assembled.storagePath,
      sizeBytes: assembled.sizeBytes,
      mimeType: assembled.mimeType,
      durationSec: input.durationSec,
      chunkCount: input.chunkCount,
      finishedAt: new Date(),
      error: null,
    },
  });

  await prisma.consultation.update({
    where: { id: input.consultationId },
    data: { status: 'PROCESSING' },
  });

  const existing = await prisma.processingJob.count({
    where: {
      consultationId: input.consultationId,
      type: 'TRANSCRIBE',
      status: { in: ['QUEUED', 'RUNNING', 'SUCCEEDED'] },
    },
  });
  if (existing === 0) {
    await enqueueJob({ consultationId: input.consultationId, type: 'TRANSCRIBE' });
  }

  await logAudit({
    userId: input.userId ?? null,
    action: 'RECORDING_FINALIZED',
    entityType: 'Consultation',
    entityId: input.consultationId,
    meta: {
      recordingId: recording.id,
      durationSec: input.durationSec,
      chunks: input.chunkCount,
      sizeBytes: assembled.sizeBytes,
    },
  });

  return { status: 'PROCESSING' as const, recordingId: recording.id, alreadyFinalized: false };
}
