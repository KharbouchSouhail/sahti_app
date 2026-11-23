import 'dotenv/config';
import { enqueueJob, resetStaleJobs, runJobById, runPendingJobs } from '../src/lib/jobs/queue';
import { prisma } from '../src/lib/prisma';

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

async function ensurePurgeJob() {
  const recent = await prisma.processingJob.findFirst({
    where: {
      type: 'PURGE',
      createdAt: { gte: new Date(Date.now() - PURGE_INTERVAL_MS) },
      status: { in: ['QUEUED', 'RUNNING', 'SUCCEEDED'] },
    },
    select: { id: true },
  });
  if (!recent) {
    await enqueueJob({ type: 'PURGE', maxAttempts: 1 });
  }
}

async function main() {
  console.log('[worker] Sehhati démarré');

  if (process.env.REDIS_URL && process.env.QUEUE_DRIVER !== 'db') {
    try {
      const { Worker } = await import('bullmq');
      const worker = new Worker(
        'sehhati-ai',
        async (job) => {
          await runJobById(String(job.data.jobId));
        },
        {
          connection: { url: process.env.REDIS_URL },
          concurrency: 2,
        },
      );
      worker.on('failed', (job, error) => {
        console.error('[worker] job BullMQ échoué', job?.id, error?.message);
      });
      console.log('[worker] consommateur BullMQ actif');
    } catch (error) {
      console.warn('[worker] BullMQ indisponible, repli sur la file PostgreSQL', error);
    }
  }

  await resetStaleJobs();
  await ensurePurgeJob();
  await runPendingJobs(10);

  setInterval(() => {
    void runPendingJobs(10).catch((error) => console.error('[worker] poll', error));
  }, POLL_MS);

  setInterval(() => {
    void ensurePurgeJob().catch((error) => console.error('[worker] purge', error));
  }, PURGE_INTERVAL_MS);

  setInterval(() => {
    void resetStaleJobs().catch((error) => console.error('[worker] stale', error));
  }, 60_000);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`[worker] ${signal} reçu, arrêt`);
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch(async (error) => {
  console.error('[worker] fatal', error);
  await prisma.$disconnect();
  process.exit(1);
});
