import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  FileClock,
  FileText,
  Link2,
  QrCode,
  ScanLine,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, HighlightCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBubble } from '@/components/ui/icon-bubble';
import { formatDate, firstName } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DoctorDashboard({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.dashboard' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const td = await getTranslations({ locale, namespace: 'doctor.detail' });

  const data = await getSessionUser();
  const user = data!.user;
  const doctor = user.doctor!;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, drafts, awaiting, linked, total, toReview, processing, pending, draftList, reviewList, recent] =
    await Promise.all([
      prisma.consultation.count({
        where: { doctorId: doctor.id, consultedAt: { gte: startOfDay, lt: endOfDay } },
      }),
      prisma.consultation.count({ where: { doctorId: doctor.id, status: 'DRAFT' } }),
      prisma.consultation.count({ where: { doctorId: doctor.id, status: 'COMPLETED' } }),
      prisma.consultation.count({
        where: { doctorId: doctor.id, status: 'LINKED', linkedAt: { gte: startOfMonth } },
      }),
      prisma.consultation.count({ where: { doctorId: doctor.id } }),
      prisma.consultation.count({ where: { doctorId: doctor.id, status: 'AI_REVIEW' } }),
      prisma.consultation.count({
        where: { doctorId: doctor.id, status: { in: ['RECORDING', 'PROCESSING'] } },
      }),
      prisma.consultation.findMany({
        where: { doctorId: doctor.id, status: 'COMPLETED' },
        orderBy: { consultedAt: 'desc' },
        take: 4,
      }),
      prisma.consultation.findMany({
        where: { doctorId: doctor.id, status: 'DRAFT' },
        orderBy: { updatedAt: 'desc' },
        take: 4,
      }),
      prisma.consultation.findMany({
        where: { doctorId: doctor.id, status: 'AI_REVIEW' },
        orderBy: { updatedAt: 'desc' },
        take: 4,
      }),
      prisma.consultation.findMany({
        where: { doctorId: doctor.id },
        orderBy: { consultedAt: 'desc' },
        take: 6,
        include: {
          patient: { include: { user: { select: { fullName: true } } } },
        },
      }),
    ]);

  function hrefFor(item: {
    id: string;
    status: 'DRAFT' | 'RECORDING' | 'PROCESSING' | 'AI_REVIEW' | 'COMPLETED' | 'LINKED';
  }) {
    if (item.status === 'DRAFT') return `/${locale}/doctor/consultations/${item.id}/edit`;
    if (item.status === 'RECORDING' || item.status === 'PROCESSING')
      return `/${locale}/doctor/consultations/${item.id}/processing`;
    if (item.status === 'AI_REVIEW') return `/${locale}/doctor/consultations/${item.id}/review`;
    if (item.status === 'COMPLETED') return `/${locale}/doctor/consultations/${item.id}/finish`;
    return `/${locale}/doctor/consultations/${item.id}`;
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={t('title')}
        title={t('greeting', { name: firstName(user.fullName) })}
        subtitle={t('subtitle')}
        actions={
          <>
            <span className="hidden h-10 items-center gap-2 rounded-full bg-primary-50 px-4 text-xs font-semibold text-primary-700 sm:inline-flex">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(now, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <Link href={`/${locale}/doctor/consultations/new`} className="btn-violet h-10 px-4 text-xs">
              <CalendarPlus className="h-4 w-4" />
              {t('newConsultation')}
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <StatCard
          className="xl:col-span-5"
          label={t('todayConsultations')}
          value={today}
          suffix={t('countToday', { count: today })}
          action={{ label: tc('view'), href: `/${locale}/doctor/consultations` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-white/75 px-2.5 py-2 ring-1 ring-white/60">
              <IconBubble color="violet" size="sm">
                <ClipboardList />
              </IconBubble>
              <div>
                <p className="text-xs font-bold leading-none">{total}</p>
                <p className="mt-0.5 text-[9px] font-medium text-ink-500">
                  {t('countTotal', { count: total })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/75 px-2.5 py-2 ring-1 ring-white/60">
              <IconBubble color="yellow" size="sm">
                <FileClock />
              </IconBubble>
              <div>
                <p className="text-xs font-bold leading-none">{drafts}</p>
                <p className="mt-0.5 text-[9px] font-medium text-ink-500">{t('drafts')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/75 px-2.5 py-2 ring-1 ring-white/60">
              <IconBubble color="peach" size="sm">
                <Link2 />
              </IconBubble>
              <div>
                <p className="text-xs font-bold leading-none">{awaiting}</p>
                <p className="mt-0.5 text-[9px] font-medium text-ink-500">{t('awaitingLink')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/75 px-2.5 py-2 ring-1 ring-white/60">
              <IconBubble color="violet" size="sm">
                <Sparkles />
              </IconBubble>
              <div>
                <p className="text-xs font-bold leading-none">{toReview}</p>
                <p className="mt-0.5 text-[9px] font-medium text-ink-500">{t('toReview')}</p>
              </div>
            </div>
          </div>
        </StatCard>

        <HighlightCard
          tone="violet"
          className="xl:col-span-4"
          title={t('pendingTitle')}
          icon={<Link2 />}
          footer={
            <Link
              href={`/${locale}/doctor/consultations?status=COMPLETED`}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-white/80 hover:text-white"
            >
              {t('linkNow')}
              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </Link>
          }
        >
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold leading-none">{awaiting}</span>
            <p className="pb-1 text-[11px] leading-relaxed text-white/65">{t('pendingHint')}</p>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2">
            <ScanLine className="h-3.5 w-3.5 text-white/70" />
            <p className="text-[10px] font-medium text-white/60">{t('linkHint')}</p>
          </div>
        </HighlightCard>

        <HighlightCard
          tone="accent"
          className="xl:col-span-3"
          title={t('linkedThisMonth')}
          icon={<CheckCircle2 />}
        >
          <span className="text-4xl font-bold leading-none">{linked}</span>
          <p className="mt-2 text-[11px] leading-relaxed text-white/70">
            {t('countTotal', { count: total })}
          </p>
        </HighlightCard>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-100 text-primary-600">
                <Link2 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold">{t('pendingTitle')}</h2>
                <p className="text-[10px] text-ink-400">{t('pendingHint')}</p>
              </div>
            </div>
            <span className="grid h-7 min-w-7 place-items-center rounded-full bg-primary-50 px-2 text-[11px] font-bold text-primary-700">
              {awaiting}
            </span>
          </div>

          {pending.length > 0 ? (
            <div className="mt-3 space-y-2">
              {pending.map((item) => (
                <Link
                  key={item.id}
                  href={`/${locale}/doctor/consultations/${item.id}/finish`}
                  className="group flex items-center gap-3 rounded-2xl bg-primary-50/60 p-3 transition-colors hover:bg-primary-100/70"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-sm">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-ink-900">{item.reason || '—'}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {formatDate(item.consultedAt, locale, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className="hidden rounded-full bg-ink-900 px-3 py-1.5 text-[10px] font-semibold text-white group-hover:bg-ink-700 sm:inline-flex">
                    {t('linkNow')}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300 rtl:rotate-180" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#E9F6F1] p-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-medium text-ink-500">{t('pendingEmpty')}</p>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#FDF4DE] text-[#C2912A]">
                <FileClock className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold">{t('draftsTitle')}</h2>
                <p className="text-[10px] text-ink-400">{t('drafts')}</p>
              </div>
            </div>
            <span className="grid h-7 min-w-7 place-items-center rounded-full bg-primary-50 px-2 text-[11px] font-bold text-primary-700">
              {drafts}
            </span>
          </div>

          {draftList.length > 0 ? (
            <div className="mt-3 space-y-2">
              {draftList.map((item) => (
                <Link
                  key={item.id}
                  href={`/${locale}/doctor/consultations/${item.id}/edit`}
                  className="group flex items-center gap-3 rounded-2xl bg-primary-50/60 p-3 transition-colors hover:bg-primary-100/70"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#C2912A] shadow-sm">
                    <FileClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-ink-900">{item.reason || td('notLinked')}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {formatDate(item.updatedAt, locale, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="hidden rounded-full bg-primary-100 px-3 py-1.5 text-[10px] font-semibold text-primary-700 group-hover:bg-primary-200 sm:inline-flex">
                    {t('continueDraft')}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300 rtl:rotate-180" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#E9F6F1] p-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-medium text-ink-500">{t('draftsEmpty')}</p>
            </div>
          )}
        </section>
      </div>

      {toReview > 0 || processing > 0 ? (
        <section className="mt-4 rounded-3xl bg-gradient-to-br from-primary-600 to-primary-800 p-5 text-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold">{t('reviewTitle')}</h2>
                <p className="text-[10px] text-white/60">{t('reviewHint')}</p>
              </div>
            </div>
            {processing > 0 ? (
              <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold text-white/80">
                {t('processingCount', { count: processing })}
              </span>
            ) : null}
          </div>

          {reviewList.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {reviewList.map((item) => (
                <Link
                  key={item.id}
                  href={`/${locale}/doctor/consultations/${item.id}/review`}
                  className="group flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10 transition-colors hover:bg-white/15"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{item.reason || t('reviewUntitled')}</p>
                    <p className="mt-0.5 text-[10px] text-white/60">
                      {formatDate(item.updatedAt, locale, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-primary-700">
                    {t('reviewNow')}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2.5 text-[11px] text-white/70">
              {t('reviewEmpty')}
            </p>
          )}
        </section>
      ) : null}

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">{t('recent')}</h2>
          <Link
            href={`/${locale}/doctor/consultations`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800"
          >
            {t('open')}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        </div>

        {recent.length > 0 ? (
          <div className="space-y-2.5">
            {recent.map((item) => {
              const patientName = item.patient?.user.fullName ?? null;
              return (
                <Link
                  key={item.id}
                  href={hrefFor(item)}
                  className="group flex items-center gap-3.5 rounded-3xl bg-white p-4 ring-1 ring-line/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft sm:gap-4"
                >
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100/60">
                    <span className="text-lg font-bold leading-none">
                      {formatDate(item.consultedAt, locale, { day: '2-digit' })}
                    </span>
                    <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-ink-400">
                      {formatDate(item.consultedAt, locale, { month: 'short' })}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-ink-900">{item.reason || '—'}</h3>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-500">
                      {patientName ? (
                        <>
                          <Stethoscope className="h-3 w-3 shrink-0 text-ink-300" />
                          {patientName}
                        </>
                      ) : (
                        <>
                          <QrCode className="h-3 w-3 shrink-0 text-ink-300" />
                          {td('notLinked')}
                        </>
                      )}
                    </p>
                    {item.diagnosis ? (
                      <p className="mt-1 line-clamp-1 text-[11px] text-ink-400">{item.diagnosis}</p>
                    ) : null}
                  </div>

                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<CalendarPlus />}
            title={t('pendingEmpty')}
            body={t('subtitle')}
            action={
              <Link href={`/${locale}/doctor/consultations/new`} className="btn-violet">
                <CalendarPlus className="h-4 w-4" />
                {t('newConsultation')}
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
