import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { ArrowLeft, CheckCircle2, FileText, PencilLine, ShieldCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getActiveGrant } from '@/lib/access';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { FinishActions } from './finish-actions';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function FinishConsultationPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.finish' });
  const td = await getTranslations({ locale, namespace: 'doctor.detail' });
  const tf = await getTranslations({ locale, namespace: 'doctor.form' });
  const data = await getSessionUser();
  const doctor = data!.user.doctor!;

  const consultation = await prisma.consultation.findFirst({
    where: { id, doctorId: doctor.id },
    include: {
      patient: { include: { user: { select: { fullName: true } } } },
      claimCode: { select: { expiresAt: true, usedAt: true } },
    },
  });

  if (!consultation) {
    return (
      <div className="animate-fade-up">
        <EmptyState
          icon={<FileText />}
          title={tf('newTitle')}
          body={td('completeFirst')}
          action={
            <Link href={`/${locale}/doctor/consultations`} className="btn-violet">
              {t('backToConsultations')}
            </Link>
          }
        />
      </div>
    );
  }

  if (consultation.status === 'AI_REVIEW') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/review`);
  }
  if (consultation.status === 'RECORDING' || consultation.status === 'PROCESSING') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}/processing`);
  }

  const backLink = (
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link
        href={`/${locale}/doctor/consultations`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
      >
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        {t('backToConsultations')}
      </Link>
      <div className="flex items-center gap-2">
        <Badge variant="violet">{consultation.reason || tf('newTitle')}</Badge>
        <span className="text-[11px] text-ink-400">
          {formatDate(consultation.consultedAt, locale, {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>
    </div>
  );

  if (consultation.status === 'DRAFT') {
    return (
      <div className="animate-fade-up">
        {backLink}
        <div className="rounded-[30px] bg-white p-6 text-center shadow-card ring-1 ring-line/70 sm:p-10">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-[#FDF4DE] text-[#C2912A]">
            <PencilLine className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-xl font-bold">{t('title')}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
            {td('completeFirst')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href={`/${locale}/doctor/consultations/${consultation.id}/edit`}
              className="btn-violet"
            >
              {td('edit')}
            </Link>
            <Link href={`/${locale}/doctor/consultations`} className="btn-outline">
              {t('backToConsultations')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (consultation.status === 'LINKED') {
    const grantActive = consultation.patientId
      ? !!(await getActiveGrant(doctor.id, consultation.patientId))
      : false;
    return (
      <div className="animate-fade-up">
        {backLink}
        <div className="rounded-[30px] bg-white p-6 shadow-card ring-1 ring-line/70 sm:p-10">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <span className="relative grid h-20 w-20 place-items-center rounded-full bg-[#E9F6F1]">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-[#8FD9BE]/40" />
              <CheckCircle2 className="relative h-10 w-10 text-success" />
            </span>
            <h1 className="mt-5 text-xl font-bold">{t('successTitle')}</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{t('linkedNotice')}</p>
            {consultation.patient ? (
              <div className="mt-4 rounded-2xl bg-primary-50 px-4 py-2.5 text-xs font-semibold text-primary-700">
                {t('linkSuccess', { name: consultation.patient.user.fullName })}
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                href={`/${locale}/doctor/consultations/${consultation.id}`}
                className="btn-violet"
              >
                {t('viewConsultation')}
              </Link>
              <Link href={`/${locale}/doctor/consultations`} className="btn-outline">
                {t('backToConsultations')}
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-1.5 text-[10px] text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              {grantActive ? td('securityNoteActive') : td('securityNote')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="no-print">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
      </div>
      <div className="no-print mb-4">
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-[#E9F6F1] px-5 py-4 ring-1 ring-[#D8F0E7]">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-success">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink-900">{t('stepDone')}</p>
            <p className="mt-0.5 truncate text-[11px] text-ink-500">
              {consultation.reason} ·{' '}
              {formatDate(consultation.consultedAt, locale, {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <Link
            href={`/${locale}/doctor/consultations/${consultation.id}`}
            className="text-[11px] font-bold text-success hover:underline"
          >
            {td('title')}
          </Link>
        </div>
      </div>

      <FinishActions
        consultationId={consultation.id}
        hasActiveClaimCode={Boolean(
          consultation.claimCode && !consultation.claimCode.usedAt,
        )}
      />
    </div>
  );
}
