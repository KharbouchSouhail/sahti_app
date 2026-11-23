import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const consultation = await ownedConsultation(params.id, doctor.id);

    const [recording, transcript, extraction, jobs] = await Promise.all([
      prisma.recording.findUnique({
        where: { consultationId: consultation.id },
        select: {
          status: true,
          durationSec: true,
          chunkCount: true,
          deletedAt: true,
          error: true,
          expiresAt: true,
        },
      }),
      prisma.transcript.findUnique({
        where: { consultationId: consultation.id },
        select: {
          language: true,
          segments: true,
          purgedAt: true,
          provider: true,
          updatedAt: true,
        },
      }),
      prisma.aiExtraction.findFirst({
        where: { consultationId: consultation.id, status: 'DRAFT' },
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          provider: true,
          model: true,
          createdAt: true,
          missingFields: true,
          unverifiedFields: true,
          warnings: true,
        },
      }),
      prisma.processingJob.findMany({
        where: { consultationId: consultation.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          maxAttempts: true,
          error: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const latest = extraction ?? (await prisma.aiExtraction.findFirst({
      where: { consultationId: consultation.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        provider: true,
        model: true,
        createdAt: true,
        missingFields: true,
        unverifiedFields: true,
        warnings: true,
      },
    }));

    const failed = jobs.some((job) => job.status === 'FAILED');
    const pending = jobs.some((job) => job.status === 'QUEUED' || job.status === 'RUNNING');
    const segmentCount = Array.isArray(transcript?.segments)
      ? (transcript.segments as unknown[]).length
      : 0;

    return {
      id: consultation.id,
      status: consultation.status,
      creationMode: consultation.creationMode,
      recording,
      transcript: transcript
        ? {
            available: segmentCount > 0,
            purged: Boolean(transcript.purgedAt),
            segments: segmentCount,
            language: transcript.language,
            provider: transcript.provider,
            updatedAt: transcript.updatedAt,
          }
        : null,
      extraction: latest
        ? {
            version: latest.version,
            provider: latest.provider,
            model: latest.model,
            createdAt: latest.createdAt,
            missingFields: latest.missingFields,
            unverifiedFields: latest.unverifiedFields,
            warnings: Array.isArray(latest.warnings) ? latest.warnings.length : 0,
          }
        : null,
      jobs,
      failed,
      pending,
    };
  });
}
