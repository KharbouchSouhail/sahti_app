import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import {
  ArrowRight,
  CalendarPlus,
  ClipboardList,
  FileClock,
  FileText,
  Mic,
  Paperclip,
  Pill,
  Search,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { PillTabs } from '@/components/ui/pill-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  query?: string;
  status?: string;
  page?: string;
};

export default async function DoctorConsultationsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: SearchParams;
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.consultations' });
  const td = await getTranslations({ locale, namespace: 'doctor.detail' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const data = await getSessionUser();
  const doctor = data!.user.doctor!;

  const query = typeof searchParams.query === 'string' ? searchParams.query.trim() : '';
  const statuses = [
    'DRAFT',
    'RECORDING',
    'PROCESSING',
    'AI_REVIEW',
    'COMPLETED',
    'LINKED',
  ] as const;
  type Status = (typeof statuses)[number];
  const status = statuses.includes(searchParams.status as Status)
    ? (searchParams.status as Status)
    : '';
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const base = `/${locale}/doctor/consultations`;

  function buildHref(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (status) params.set('status', status);
    if (page > 1) params.set('page', String(page));
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  const where: Prisma.ConsultationWhereInput = { doctorId: doctor.id };
  if (status) where.status = status;
  if (query) {
    where.OR = [
      { reason: { contains: query, mode: 'insensitive' } },
      { diagnosis: { contains: query, mode: 'insensitive' } },
      { patient: { user: { fullName: { contains: query, mode: 'insensitive' } } } },
    ];
  }

  const [total, items, grouped] = await Promise.all([
    prisma.consultation.count({ where }),
    prisma.consultation.findMany({
      where,
      orderBy: { consultedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        patient: { include: { user: { select: { fullName: true } } } },
        _count: { select: { attachments: true, prescriptions: true } },
      },
    }),
    prisma.consultation.groupBy({
      by: ['status'],
      where: { doctorId: doctor.id },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<Status, number> = {
    DRAFT: 0,
    RECORDING: 0,
    PROCESSING: 0,
    AI_REVIEW: 0,
    COMPLETED: 0,
    LINKED: 0,
  };
  for (const row of grouped) counts[row.status] = row._count._all;
  const allCount = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const tabs = [
    { label: `${t('filterAll')} · ${allCount}`, href: buildHref({ status: undefined, page: undefined }), active: !status },
    {
      label: `${t('filterDraft')} · ${counts.DRAFT}`,
      href: buildHref({ status: 'DRAFT', page: undefined }),
      active: status === 'DRAFT',
    },
    {
      label: `${t('filterProcessing')} · ${counts.RECORDING + counts.PROCESSING}`,
      href: buildHref({ status: 'PROCESSING', page: undefined }),
      active: status === 'PROCESSING' || status === 'RECORDING',
    },
    {
      label: `${t('filterReview')} · ${counts.AI_REVIEW}`,
      href: buildHref({ status: 'AI_REVIEW', page: undefined }),
      active: status === 'AI_REVIEW',
    },
    {
      label: `${t('filterCompleted')} · ${counts.COMPLETED}`,
      href: buildHref({ status: 'COMPLETED', page: undefined }),
      active: status === 'COMPLETED',
    },
    {
      label: `${t('filterLinked')} · ${counts.LINKED}`,
      href: buildHref({ status: 'LINKED', page: undefined }),
      active: status === 'LINKED',
    },
  ];

  function actionFor(item: (typeof items)[number]) {
    if (item.status === 'DRAFT') {
      return { href: `/${locale}/doctor/consultations/${item.id}/edit`, label: t('continue') };
    }
    if (item.status === 'RECORDING' || item.status === 'PROCESSING') {
      return {
        href: `/${locale}/doctor/consultations/${item.id}/processing`,
        label: t('followProcessing'),
      };
    }
    if (item.status === 'AI_REVIEW') {
      return {
        href: `/${locale}/doctor/consultations/${item.id}/review`,
        label: t('review'),
      };
    }
    if (item.status === 'COMPLETED') {
      return { href: `/${locale}/doctor/consultations/${item.id}/finish`, label: t('link') };
    }
    return { href: `/${locale}/doctor/consultations/${item.id}`, label: t('view') };
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link href={`/${locale}/doctor/consultations/new`} className="btn-violet h-10 px-4 text-xs">
            <CalendarPlus className="h-4 w-4" />
            {t('new')}
          </Link>
        }
      />

      <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            action={base}
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-primary-50 px-2 ps-4 ring-1 ring-primary-100/70 transition-all focus-within:bg-white focus-within:ring-primary-300"
          >
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              name="query"
              defaultValue={query}
              placeholder={t('searchPlaceholder')}
              className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <button
              type="submit"
              className="h-8 rounded-full bg-white px-3 text-[11px] font-semibold text-primary-700 shadow-sm hover:bg-primary-100"
            >
              {tc('search')}
            </button>
          </form>

          <span className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full bg-primary-50 px-3.5 text-[11px] font-semibold text-ink-500 lg:self-auto">
            <ClipboardList className="h-3.5 w-3.5 text-primary-500" />
            {t('resultsCount', { count: total })}
          </span>
        </div>

        <div className="mt-3">
          <PillTabs items={tabs} ariaLabel={t('title')} />
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-4">
          {/* En-tête desktop */}
          <div className="hidden grid-cols-[108px_1.1fr_1.5fr_110px_150px] items-center gap-3 px-5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400 md:grid">
            <span>{t('columns.date')}</span>
            <span>{t('columns.patient')}</span>
            <span>{t('columns.reason')}</span>
            <span>{t('columns.status')}</span>
            <span className="text-end">{t('columns.actions')}</span>
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const action = actionFor(item);
              const patientName = item.patient?.user.fullName ?? null;
              return (
                <div
                  key={item.id}
                  className="rounded-3xl bg-white p-4 ring-1 ring-line/70 transition-all duration-200 hover:shadow-soft md:grid md:grid-cols-[108px_1.1fr_1.5fr_110px_150px] md:items-center md:gap-3 md:px-5"
                >
                  <div className="flex items-center gap-3 md:block">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100/60 md:hidden">
                      <span className="text-sm font-bold leading-none">
                        {formatDate(item.consultedAt, locale, { day: '2-digit' })}
                      </span>
                    </span>
                    <div>
                      <p className="text-xs font-bold text-ink-900">
                        {formatDate(item.consultedAt, locale, {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {formatDate(item.consultedAt, locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 min-w-0 md:mt-0">
                    {patientName ? (
                      <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-ink-700">
                        <Stethoscope className="h-3 w-3 shrink-0 text-ink-300" />
                        {patientName}
                      </p>
                    ) : (
                      <p className="text-[11px] font-medium text-ink-400">{t('notLinked')}</p>
                    )}
                    {item.patient?.patientCode ? (
                      <p className="ltr-code mt-0.5 text-[10px] text-ink-300">{item.patient.patientCode}</p>
                    ) : null}
                  </div>

                  <div className="mt-2 min-w-0 md:mt-0">
                    <p className="truncate text-sm font-bold text-ink-900">{item.reason || '—'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item.diagnosis ? (
                        <p className="line-clamp-1 text-[10px] text-ink-400">{item.diagnosis}</p>
                      ) : null}
                      {item._count.attachments > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[9px] font-semibold text-ink-500">
                          <Paperclip className="h-2.5 w-2.5" />
                          {item._count.attachments}
                        </span>
                      ) : null}
                      {item._count.prescriptions > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#E9F6F1] px-2 py-0.5 text-[9px] font-semibold text-success">
                          <Pill className="h-2.5 w-2.5" />
                          {item._count.prescriptions}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2.5 md:mt-0">
                    <StatusBadge status={item.status} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 md:mt-0 md:justify-end">
                    <Link
                      href={action.href}
                      className={
                        item.status === 'COMPLETED'
                          ? 'inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[11px] font-semibold text-white shadow-pill transition-colors hover:bg-ink-700'
                          : item.status === 'AI_REVIEW'
                            ? 'inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-600 px-4 text-[11px] font-semibold text-white shadow-pill transition-colors hover:bg-primary-700'
                            : 'inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-50 px-4 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-100'
                      }
                    >
                      {item.status === 'DRAFT' ? <FileClock className="h-3.5 w-3.5" /> : null}
                      {item.status === 'COMPLETED' ? <FileText className="h-3.5 w-3.5" /> : null}
                      {item.status === 'AI_REVIEW' ? <Sparkles className="h-3.5 w-3.5" /> : null}
                      {item.status === 'RECORDING' ? <Mic className="h-3.5 w-3.5" /> : null}
                      {item.status === 'PROCESSING' ? <FileText className="h-3.5 w-3.5" /> : null}
                      {action.label}
                      <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={<ClipboardList />}
            title={query || status ? tc('noResults') : t('emptyTitle')}
            body={query || status ? t('emptyBody') : t('emptyBody')}
            action={
              query || status ? (
                <Link href={base} className="btn-outline">
                  {t('filterAll')}
                </Link>
              ) : (
                <Link href={`/${locale}/doctor/consultations/new`} className="btn-violet">
                  <CalendarPlus className="h-4 w-4" />
                  {t('new')}
                </Link>
              )
            }
          />
        </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="mt-7 flex items-center justify-center gap-2">
          {page > 1 ? (
            <Link href={buildHref({ page: String(page - 1) })} className="btn-outline h-9 px-4 text-xs">
              {tc('back')}
            </Link>
          ) : null}
          <span className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink-500 ring-1 ring-line">
            {tc('page')} {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          {page < Math.ceil(total / PAGE_SIZE) ? (
            <Link href={buildHref({ page: String(page + 1) })} className="btn-outline h-9 px-4 text-xs">
              {tc('showMore')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
