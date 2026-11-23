import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { ArrowLeft, FileText } from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/ui/empty-state';
import { ProcessingView, type ProcessingData } from '@/components/doctor/ai/processing-view';

export const dynamic = 'force-dynamic';

export default async function ProcessingPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.ai.processing' });
  const data = await getSessionUser();
  const doctor = data!.user.doctor!;

  const consultation = await prisma.consultation.findFirst({
    where: { id, doctorId: doctor.id },
    include: {
      recording: {
        select: { status: true, durationSec: true, deletedAt: true },
      },
      transcript: {
        select: { segments: true, language: true, purgedAt: true },
      },
      extractions: {
        orderBy: { version: 'desc' },
        take: 1,
        select: {
          version: true,
          provider: true,
          model: true,
          status: true,
          missingFields: true,
          unverifiedFields: true,
          warnings: true,
          createdAt: true,
        },
      },
      jobs: {
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
      },
    },
  });

  if (!consultation) {
    return (
      <div className="animate-fade-up">
        <EmptyState
          icon={<FileText />}
          title={t('notFound')}
          body={t('notFoundBody')}
          action={
            <Link href={`/${locale}/doctor/consultations`} className="btn-violet">
              {t('back')}
            </Link>
          }
        />
      </div>
    );
  }

  if (consultation.status === 'AI_REVIEW') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/review`);
  }
  if (consultation.status === 'COMPLETED' || consultation.status === 'LINKED') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/finish`);
  }
  if (consultation.status === 'DRAFT') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/edit`);
  }

  const segments = Array.isArray(consultation.transcript?.segments)
    ? (consultation.transcript!.segments as unknown[])
    : [];
  const extraction = consultation.extractions[0];

  const initial: ProcessingData = {
    id: consultation.id,
    status: consultation.status,
    recording: consultation.recording
      ? {
          status: consultation.recording.status,
          durationSec: consultation.recording.durationSec,
          deletedAt: consultation.recording.deletedAt
            ? consultation.recording.deletedAt.toISOString()
            : null,
        }
      : null,
    transcript: consultation.transcript
      ? {
          available: segments.length > 0,
          segments: segments.length,
          language: consultation.transcript.language,
          purged: Boolean(consultation.transcript.purgedAt),
        }
      : null,
    extraction: extraction
      ? {
          version: extraction.version,
          provider: extraction.provider,
          model: extraction.model,
          warnings: Array.isArray(extraction.warnings) ? extraction.warnings.length : 0,
        }
      : null,
    jobs: consultation.jobs.map((job) => ({
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    })),
    failed: consultation.jobs.some((job) => job.status === 'FAILED'),
    pending: consultation.jobs.some(
      (job) => job.status === 'QUEUED' || job.status === 'RUNNING',
    ),
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-4">
        <Link
          href={`/${locale}/doctor/consultations`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {t('back')}
        </Link>
      </div>
      <ProcessingView consultationId={consultation.id} locale={locale} initial={initial} />
    </div>
  );
}
