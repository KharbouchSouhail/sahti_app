import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { deleteRecordingFiles } from '@/lib/recording-storage';

export function audioRetentionDays() {
  const value = Number(process.env.AUDIO_RETENTION_DAYS ?? 7);
  return Number.isFinite(value) && value > 0 ? value : 7;
}

export function transcriptRetentionDays() {
  const value = Number(process.env.TRANSCRIPT_RETENTION_DAYS ?? 30);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export function maxAudioMinutes() {
  const value = Number(process.env.MAX_AUDIO_MINUTES ?? 60);
  return Number.isFinite(value) && value > 0 ? value : 60;
}

export function audioExpiryDate(from = new Date()) {
  return new Date(from.getTime() + audioRetentionDays() * 24 * 3600 * 1000);
}

export async function deleteRecordingNow(
  consultationId: string,
  options: { userId?: string | null; reason?: string } = {},
) {
  const recording = await prisma.recording.findUnique({ where: { consultationId } });
  if (!recording) return { deleted: false as const };
  if (recording.deletedAt) return { deleted: false as const };

  await deleteRecordingFiles(recording.id);
  await prisma.recording.update({
    where: { id: recording.id },
    data: {
      status: 'DELETED',
      storagePath: null,
      deletedAt: new Date(),
      sizeBytes: 0,
    },
  });

  await logAudit({
    userId: options.userId ?? null,
    action: 'AUDIO_DELETED',
    entityType: 'Consultation',
    entityId: consultationId,
    meta: {
      recordingId: recording.id,
      reason: options.reason ?? 'MANUAL',
    },
  });

  return { deleted: true as const };
}

export async function purgeExpiredData() {
  const now = new Date();
  let audioDeleted = 0;
  let transcriptsPurged = 0;

  const expiredRecordings = await prisma.recording.findMany({
    where: {
      deletedAt: null,
      expiresAt: { lte: now },
      status: { not: 'DELETED' },
    },
    select: { id: true, consultationId: true },
    take: 100,
  });

  for (const recording of expiredRecordings) {
    await deleteRecordingFiles(recording.id);
    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: 'DELETED',
        storagePath: null,
        deletedAt: new Date(),
        sizeBytes: 0,
      },
    });
    await logAudit({
      userId: null,
      action: 'AUDIO_DELETED',
      entityType: 'Consultation',
      entityId: recording.consultationId,
      meta: { recordingId: recording.id, reason: 'RETENTION' },
    });
    audioDeleted += 1;
  }

  const transcriptCutoff = new Date(
    now.getTime() - transcriptRetentionDays() * 24 * 3600 * 1000,
  );
  const expiredTranscripts = await prisma.transcript.findMany({
    where: {
      purgedAt: null,
      createdAt: { lte: transcriptCutoff },
      consultation: { status: { in: ['COMPLETED', 'LINKED'] } },
    },
    select: { id: true, consultationId: true },
    take: 200,
  });

  for (const transcript of expiredTranscripts) {
    await prisma.transcript.update({
      where: { id: transcript.id },
      data: { text: '', segments: [], purgedAt: new Date() },
    });
    await logAudit({
      userId: null,
      action: 'TRANSCRIPT_DELETED',
      entityType: 'Consultation',
      entityId: transcript.consultationId,
      meta: { transcriptId: transcript.id, reason: 'RETENTION' },
    });
    transcriptsPurged += 1;
  }

  return { audioDeleted, transcriptsPurged };
}
