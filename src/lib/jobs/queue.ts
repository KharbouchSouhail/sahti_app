import { randomUUID } from 'node:crypto';
import type { JobType, Prisma, ProcessingJob } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const WORKER_ID = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
const BACKOFF_BASE_MS = Number(process.env.JOB_BACKOFF_MS ?? 5000);
const STALE_LOCK_MS = 10 * 60 * 1000;

type InlineState = {
  scheduled: boolean;
  running: boolean;
};

const globalForJobs = globalThis as unknown as { __sehhatiJobs?: InlineState };
const inlineState: InlineState = (globalForJobs.__sehhatiJobs ??= {
  scheduled: false,
  running: false,
});

export function inlineJobsEnabled() {
  if (process.env.INLINE_JOBS === '0') return false;
  if (process.env.INLINE_JOBS === '1') return true;
  return !process.env.REDIS_URL;
}

export async function enqueueJob(input: {
  consultationId?: string | null;
  type: JobType;
  payload?: Prisma.InputJsonValue;
  runAt?: Date;
  maxAttempts?: number;
}) {
  const data: Prisma.ProcessingJobUncheckedCreateInput = {
    type: input.type,
    payload: input.payload,
    runAt: input.runAt ?? new Date(),
    maxAttempts: input.maxAttempts ?? 3,
    ...(input.consultationId ? { consultationId: input.consultationId } : {}),
  };
  const job = await prisma.processingJob.create({ data });

  await notifyRedis(job.id);

  if (inlineJobsEnabled()) scheduleInlineRun();
  return job;
}

async function notifyRedis(jobId: string) {
  if (!process.env.REDIS_URL) return;
  if (process.env.QUEUE_DRIVER === 'db') return;
  try {
    const { Queue } = await import('bullmq');
    const queue = new Queue('sehhati-ai', {
      connection: { url: process.env.REDIS_URL },
    });
    await queue.add('process', { jobId }, { jobId, removeOnComplete: true, removeOnFail: 100 });
    await queue.close();
  } catch (error) {
    console.warn('[jobs] Redis indisponible, traitement local de secours', error);
    scheduleInlineRun();
  }
}

async function claimJob(): Promise<ProcessingJob | null> {
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.processingJob.findFirst({
      where: { status: 'QUEUED', runAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) return null;

    const claimed = await prisma.processingJob.updateMany({
      where: { id: candidate.id, status: 'QUEUED' },
      data: {
        status: 'RUNNING',
        lockedAt: new Date(),
        lockedBy: WORKER_ID,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 1) {
      return prisma.processingJob.findUnique({ where: { id: candidate.id } });
    }
  }
  return null;
}

async function executeClaimedJob(job: ProcessingJob) {
  try {
    const { executeJob } = await import('@/lib/ai/pipeline');
    const result = await executeJob(job);
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCEEDED',
        result: (result ?? undefined) as Prisma.InputJsonValue | undefined,
        error: null,
        lockedAt: null,
      },
    });
  } catch (error) {
    await failJob(job, error);
  }
}

async function failJob(job: ProcessingJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[jobs] ${job.type} ${job.id} a échoué (${job.attempts}/${job.maxAttempts})`, message);

  const exhausted = job.attempts >= job.maxAttempts;
  const backoff = BACKOFF_BASE_MS * Math.pow(2, Math.max(0, job.attempts - 1));

  await prisma.processingJob.update({
    where: { id: job.id },
    data: {
      status: exhausted ? 'FAILED' : 'QUEUED',
      runAt: exhausted ? job.runAt : new Date(Date.now() + backoff),
      error: message.slice(0, 2000),
      lockedAt: null,
      lockedBy: null,
    },
  });

  if (exhausted && job.consultationId) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: job.consultationId },
      select: { doctor: { select: { userId: true } }, reason: true },
    });
    if (consultation) {
      await prisma.notification.create({
        data: {
          userId: consultation.doctor.userId,
          title: 'Traitement IA interrompu',
          body: `La consultation « ${consultation.reason || 'sans motif'} » n'a pas pu être traitée. Vous pouvez relancer ou continuer manuellement.`,
          href: `/fr/doctor/consultations/${job.consultationId}/processing`,
        },
      });
    }
  }
}

export async function runPendingJobs(max = 10) {
  for (let index = 0; index < max; index += 1) {
    const job = await claimJob();
    if (!job) break;
    await executeClaimedJob(job);
  }
}

export async function runJobById(jobId: string) {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status !== 'QUEUED') return;
  const claimed = await prisma.processingJob.updateMany({
    where: { id: jobId, status: 'QUEUED' },
    data: {
      status: 'RUNNING',
      lockedAt: new Date(),
      lockedBy: WORKER_ID,
      attempts: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return;
  const claimedJob = await prisma.processingJob.findUnique({ where: { id: jobId } });
  if (claimedJob) await executeClaimedJob(claimedJob);
}

export async function retryFailedJobs(consultationId: string) {
  await prisma.processingJob.updateMany({
    where: { consultationId, status: 'FAILED' },
    data: {
      status: 'QUEUED',
      attempts: 0,
      runAt: new Date(),
      error: null,
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (inlineJobsEnabled()) scheduleInlineRun();
}

export async function resetStaleJobs() {
  await prisma.processingJob.updateMany({
    where: {
      status: 'RUNNING',
      lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) },
    },
    data: { status: 'QUEUED', lockedAt: null, lockedBy: null },
  });
}

async function hasQueuedJobs() {
  return (await prisma.processingJob.count({ where: { status: 'QUEUED' } })) > 0;
}

function scheduleInlineRun() {
  if (inlineState.scheduled || inlineState.running) return;
  inlineState.scheduled = true;
  setTimeout(async () => {
    inlineState.scheduled = false;
    if (inlineState.running) return;
    inlineState.running = true;
    try {
      await runPendingJobs(20);
    } catch (error) {
      console.error('[jobs] exécution inline échouée', error);
    } finally {
      inlineState.running = false;
      if (await hasQueuedJobs()) scheduleInlineRun();
    }
  }, 30);
}
