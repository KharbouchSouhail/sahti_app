import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { EyeOff, QrCode, ScanLine, Search } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/shared/page-header';
import { ConsultationCard } from '@/components/shared/consultation-card';
import { PillTabs } from '@/components/ui/pill-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatMonth } from '@/lib/utils';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  query?: string;
  filter?: string;
  doctor?: string;
  showHidden?: string;
  page?: string;
};

export default async function PatientConsultationsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: SearchParams;
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'patient.consultations' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const data = await getSessionUser();
  const patient = data!.user.patient!;

  const query = typeof searchParams.query === 'string' ? searchParams.query.trim() : '';
  const filter = typeof searchParams.filter === 'string' ? searchParams.filter : '';
  const doctorId = typeof searchParams.doctor === 'string' ? searchParams.doctor : '';
  const showHidden = searchParams.showHidden === '1';
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const base = `/${locale}/patient/consultations`;

  function buildHref(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (filter) params.set('filter', filter);
    if (doctorId) params.set('doctor', doctorId);
    if (showHidden) params.set('showHidden', '1');
    if (page > 1) params.set('page', String(page));
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  const where: Prisma.ConsultationWhereInput = {
    patientId: patient.id,
    hiddenByPatient: showHidden ? undefined : false,
  };
  if (doctorId) where.doctorId = doctorId;
  if (query) {
    where.OR = [
      { reason: { contains: query, mode: 'insensitive' } },
      { diagnosis: { contains: query, mode: 'insensitive' } },
      { doctor: { user: { fullName: { contains: query, mode: 'insensitive' } } } },
    ];
  }

  const now = new Date();
  if (filter === 'month') {
    where.consultedAt = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
  } else if (filter === 'year') {
    where.consultedAt = { gte: new Date(now.getFullYear(), 0, 1) };
  }

  const [total, items, doctors] = await Promise.all([
    prisma.consultation.count({ where }),
    prisma.consultation.findMany({
      where,
      orderBy: { consultedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        doctor: { include: { user: { select: { fullName: true } } } },
        _count: { select: { attachments: true, prescriptions: true } },
      },
    }),
    prisma.consultation.findMany({
      where: { patientId: patient.id },
      select: {
        doctorId: true,
        doctor: { select: { specialty: true, user: { select: { fullName: true } } } },
      },
      distinct: ['doctorId'],
    }),
  ]);

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.consultedAt.getFullYear()}-${item.consultedAt.getMonth()}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const tabs = [
    { label: t('filterAll'), href: buildHref({ filter: undefined, page: undefined }), active: !filter },
    {
      label: t('filterThisMonth'),
      href: buildHref({ filter: 'month', page: undefined }),
      active: filter === 'month',
    },
    {
      label: t('filterThisYear'),
      href: buildHref({ filter: 'year', page: undefined }),
      active: filter === 'year',
    },
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            <Link href={`/${locale}/patient/qr`} className="btn-violet h-10 px-4 text-xs">
              <QrCode className="h-4 w-4" />
              {t('showQr')}
            </Link>
            <Link href={`/${locale}/patient/claim`} className="btn-outline h-10 px-4 text-xs">
              <ScanLine className="h-4 w-4" />
              {t('addByCode')}
            </Link>
          </>
        }
      />

      <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form action={base} className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-primary-50 px-2 ps-4 ring-1 ring-primary-100/70 transition-all focus-within:bg-white focus-within:ring-primary-300">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              name="query"
              defaultValue={query}
              placeholder={t('searchPlaceholder')}
              className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
            {filter ? <input type="hidden" name="filter" value={filter} /> : null}
            {doctorId ? <input type="hidden" name="doctor" value={doctorId} /> : null}
            {showHidden ? <input type="hidden" name="showHidden" value="1" /> : null}
            <button type="submit" className="h-8 rounded-full bg-white px-3 text-[11px] font-semibold text-primary-700 shadow-sm hover:bg-primary-100">
              {tc('search')}
            </button>
          </form>

          <form action={base} className="flex items-center gap-2">
            {query ? <input type="hidden" name="query" value={query} /> : null}
            {filter ? <input type="hidden" name="filter" value={filter} /> : null}
            {showHidden ? <input type="hidden" name="showHidden" value="1" /> : null}
            <select
              name="doctor"
              defaultValue={doctorId}
              className="h-11 max-w-[220px] rounded-full border-0 bg-primary-50 px-4 text-xs font-semibold text-primary-700 outline-none ring-1 ring-primary-100/70 focus:ring-primary-300"
            >
              <option value="">{t('filterByDoctor')}</option>
              {doctors.map((doctor) => (
                <option key={doctor.doctorId} value={doctor.doctorId}>
                  {doctor.doctor.user.fullName}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-soft h-9 px-3 text-[11px]">
              {tc('search')}
            </button>
          </form>

          <Link
            href={buildHref({ showHidden: showHidden ? undefined : '1', page: undefined })}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors',
              showHidden
                ? 'bg-ink-900 text-white'
                : 'bg-primary-50 text-ink-500 hover:bg-primary-100 hover:text-primary-700',
            )}
          >
            <EyeOff className="h-3.5 w-3.5" />
            {t('showHidden')}
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <PillTabs items={tabs} ariaLabel={t('title')} />
          <span className="rounded-full bg-primary-50 px-3 py-1.5 text-[11px] font-semibold text-ink-500">
            {t('count', { count: total })}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-7">
        {items.length > 0 ? (
          Array.from(groups.entries()).map(([key, list]) => (
            <section key={key}>
              <div className="mb-3 flex items-center gap-3 px-1">
                <span className="h-2.5 w-2.5 rounded-full bg-primary-600 ring-4 ring-primary-100" />
                <h2 className="text-sm font-bold capitalize text-ink-900">
                  {formatMonth(list[0].consultedAt, locale)}
                </h2>
                <span className="h-px flex-1 bg-line" />
                <Badge variant="gray">{list.length}</Badge>
              </div>
              <div className="ms-[5px] space-y-2.5 border-s border-primary-100 ps-4 sm:ps-5">
                {list.map((item) => (
                  <ConsultationCard
                    key={item.id}
                    data={{
                      id: item.id,
                      href: `/${locale}/patient/consultations/${item.id}`,
                      consultedAt: item.consultedAt.toISOString(),
                      reason: item.reason,
                      diagnosis: item.diagnosis,
                      doctorName: item.doctor.user.fullName,
                      specialty: item.doctor.specialty,
                      documents: item._count.attachments,
                      prescriptions: item._count.prescriptions,
                      hidden: item.hiddenByPatient,
                    }}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <EmptyState
            icon={<ScanLine />}
            title={query || filter || doctorId ? t('emptyFiltered') : t('emptyTitle')}
            body={query || filter || doctorId ? t('emptyFilteredBody') : t('emptyBody')}
            action={
              query || filter || doctorId ? (
                <Link href={base} className="btn-outline">
                  {t('filterAll')}
                </Link>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={`/${locale}/patient/qr`} className="btn-violet">
                    <QrCode className="h-4 w-4" />
                    {t('showQr')}
                  </Link>
                  <Link href={`/${locale}/patient/claim`} className="btn-outline">
                    <ScanLine className="h-4 w-4" />
                    {t('addByCode')}
                  </Link>
                </div>
              )
            }
          />
        )}
      </div>

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
