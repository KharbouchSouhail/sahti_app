import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { ArrowLeft, FileText } from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  ReviewScreen,
  type ReviewDraft,
} from '@/components/doctor/ai/review-screen';
import {
  EXTRACTION_FIELDS,
  type AiMeta,
  type ExtractionData,
  type ExtractionField,
  type ExtractionWarning,
  type TranscriptSegment,
  type UncertainPassage,
} from '@/lib/ai/types';

export const dynamic = 'force-dynamic';

function emptyFields(): Record<ExtractionField, string> {
  return EXTRACTION_FIELDS.reduce(
    (accumulator, field) => ({ ...accumulator, [field]: '' }),
    {} as Record<ExtractionField, string>,
  );
}

export default async function ReviewPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.ai.review' });
  const data = await getSessionUser();
  const doctor = data!.user.doctor!;

  const consultation = await prisma.consultation.findFirst({
    where: { id, doctorId: doctor.id },
    include: {
      recording: {
        select: { storagePath: true, deletedAt: true, status: true },
      },
      transcript: {
        select: {
          language: true,
          segments: true,
          provider: true,
          purgedAt: true,
        },
      },
      extractions: {
        where: { status: 'DRAFT' },
        orderBy: { version: 'desc' },
        take: 1,
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

  if (consultation.status === 'COMPLETED' || consultation.status === 'LINKED') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/finish`);
  }
  if (consultation.status === 'DRAFT') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/edit`);
  }
  if (consultation.status === 'RECORDING') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/processing`);
  }

  const extraction = consultation.extractions[0];
  if (!extraction) {
    return (
      <div className="animate-fade-up">
        <EmptyState
          icon={<FileText />}
          title={t('draftMissing')}
          body={t('draftMissingBody')}
          action={
            <Link
              href={`/${locale}/doctor/consultations/${consultation.id}/processing`}
              className="btn-violet"
            >
              {t('backToProcessing')}
            </Link>
          }
        />
      </div>
    );
  }

  const meta = (consultation.aiMeta ?? {}) as unknown as AiMeta;
  const extractionData = extraction.data as unknown as ExtractionData;

  const fields = emptyFields();
  const fieldSources: Record<string, string[]> = {};
  for (const field of EXTRACTION_FIELDS) {
    const entry = extractionData[field];
    fields[field] = entry?.value ?? '';
    const sources = entry?.evidence ?? [];
    if (sources.length > 0) fieldSources[field] = sources;
  }

  const draft: ReviewDraft = {
    fields,
    prescriptions: (extractionData.prescriptions ?? []).map((row) => ({
      medication: row.medication ?? '',
      dosage: row.dosage ?? '',
      frequency: row.frequency ?? '',
      duration: row.duration ?? '',
      notes: row.notes ?? '',
      confirmed: false,
      evidence: row.evidence ?? [],
    })),
    missingFields: extraction.missingFields ?? [],
    unverifiedFields: extraction.unverifiedFields ?? [],
    warnings: Array.isArray(extraction.warnings)
      ? (extraction.warnings as unknown as ExtractionWarning[])
      : [],
    uncertainPassages: Array.isArray(extractionData.uncertainPassages)
      ? (extractionData.uncertainPassages as UncertainPassage[])
      : [],
    fieldSources: {
      ...(meta.fieldSources ?? {}),
      ...fieldSources,
    },
    provider: extraction.provider,
    model: extraction.model,
    promptVersion: extraction.promptVersion,
    language: consultation.transcript?.language ?? meta.language ?? 'fr',
  };

  const segments = Array.isArray(consultation.transcript?.segments)
    ? (consultation.transcript!.segments as unknown as TranscriptSegment[])
    : [];
  const audioAvailable = Boolean(
    consultation.recording?.storagePath && !consultation.recording.deletedAt,
  );

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${locale}/doctor/consultations/${consultation.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {t('back')}
          </Link>
          <StatusBadge status={consultation.status} />
        </div>
        <p className="max-w-md text-end text-[10px] leading-relaxed text-ink-400">
          {t('subtitle')}
        </p>
      </div>

      <ReviewScreen
        consultationId={consultation.id}
        locale={locale}
        audioAvailable={audioAvailable}
        transcript={
          segments.length > 0
            ? {
                language: consultation.transcript!.language,
                segments: segments.map((segment) => ({
                  id: segment.id,
                  start: segment.start,
                  end: segment.end,
                  speaker: segment.speaker,
                  text: segment.text,
                })),
              }
            : null
        }
        draft={draft}
      />
    </div>
  );
}
