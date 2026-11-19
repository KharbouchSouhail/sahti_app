import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Eye,
  FolderOpen,
  HeartPulse,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, HighlightCard, MiniStatCard } from '@/components/shared/stat-card';
import { ConsultationCard } from '@/components/shared/consultation-card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBubble } from '@/components/ui/icon-bubble';
import { Badge } from '@/components/ui/badge';
import { formatDate, firstName } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const BUBBLE_COLORS = ['rose', 'peach', 'sky', 'violet', 'mint'] as const;
const DEFAULT_SPECIALTIES = [
  { name: 'Cardiologie', icon: HeartPulse, color: 'rose' as const },
  { name: 'Médecine générale', icon: Stethoscope, color: 'peach' as const },
  { name: 'Dermatologie', icon: Sparkles, color: 'sky' as const },
  { name: 'Pédiatrie', icon: Activity, color: 'violet' as const },
  { name: 'Analyses', icon: Eye, color: 'mint' as const },
];

function specialtyVisual(name: string, index: number) {
  const lower = name.toLowerCase();
  if (lower.includes('cardio')) return { icon: HeartPulse, color: 'rose' as const };
  if (lower.includes('dermato')) return { icon: Sparkles, color: 'sky' as const };
  if (lower.includes('pédiat') || lower.includes('pediat')) return { icon: Activity, color: 'violet' as const };
  if (lower.includes('ophtal')) return { icon: Eye, color: 'mint' as const };
  if (lower.includes('médecine') || lower.includes('general')) return { icon: Stethoscope, color: 'peach' as const };
  return { icon: Stethoscope, color: BUBBLE_COLORS[index % BUBBLE_COLORS.length] };
}

export default async function PatientDashboard({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'patient.dashboard' });
  const tp = await getTranslations({ locale, namespace: 'patient.profile' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const td = await getTranslations({ locale, namespace: 'patient.detail' });
  const data = await getSessionUser();
  const user = data!.user;
  const patient = user.patient!;

  const where: Prisma.ConsultationWhereInput = {
    patientId: patient.id,
    hiddenByPatient: false,
  };
  const now = new Date();

  const [total, documents, doctors, last, upcoming, recent, specialtiesRaw, activeGrants] = await Promise.all([
    prisma.consultation.count({ where }),
    prisma.attachment.count({ where: { consultation: where } }),
    prisma.consultation.findMany({ where, select: { doctorId: true }, distinct: ['doctorId'] }),
    prisma.consultation.findFirst({
      where,
      orderBy: { consultedAt: 'desc' },
      include: { doctor: { include: { user: { select: { fullName: true } } } } },
    }),
    prisma.consultation.findFirst({
      where: { ...where, followUpDate: { gte: now } },
      orderBy: { followUpDate: 'asc' },
      include: { doctor: { include: { user: { select: { fullName: true } } } } },
    }),
    prisma.consultation.findMany({
      where,
      orderBy: { consultedAt: 'desc' },
      take: 5,
      include: {
        doctor: { include: { user: { select: { fullName: true } } } },
        _count: { select: { attachments: true, prescriptions: true } },
      },
    }),
    prisma.consultation.findMany({
      where,
      select: { doctor: { select: { specialty: true } } },
    }),
    prisma.accessGrant.count({
      where: { patientId: patient.id, revokedAt: null, expiresAt: { gt: now } },
    }),
  ]);

  const specialtyMap = new Map<string, number>();
  for (const row of specialtiesRaw) {
    specialtyMap.set(row.doctor.specialty, (specialtyMap.get(row.doctor.specialty) ?? 0) + 1);
  }
  const specialties = Array.from(specialtyMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const todayLabel = formatDate(now, locale, { weekday: 'long', day: 'numeric', month: 'long' });

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
              {todayLabel}
            </span>
            <Link href={`/${locale}/patient/qr`} className="btn-violet h-10 px-4 text-xs">
              <QrCode className="h-4 w-4" />
              {t('openQr')}
            </Link>
            <Link href={`/${locale}/patient/claim`} className="btn-outline h-10 px-4 text-xs">
              <ScanLine className="h-4 w-4" />
              {t('addByCode')}
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <StatCard
          className="xl:col-span-8"
          label={t('totalConsultations')}
          value={total}
          action={{ label: t('viewAll'), href: `/${locale}/patient/consultations` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {specialties.length > 0
              ? specialties.map((specialty, index) => {
                  const visual = specialtyVisual(specialty.name, index);
                  const Icon = visual.icon;
                  return (
                    <div
                      key={specialty.name}
                      className="flex items-center gap-2 rounded-2xl bg-white/75 px-2.5 py-2 ring-1 ring-white/60"
                    >
                      <IconBubble color={visual.color} size="sm">
                        <Icon />
                      </IconBubble>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-none">{specialty.count}</p>
                        <p className="mt-0.5 max-w-[92px] truncate text-[9px] font-medium text-ink-500">
                          {specialty.name}
                        </p>
                      </div>
                    </div>
                  );
                })
              : DEFAULT_SPECIALTIES.map((specialty) => {
                  const Icon = specialty.icon;
                  return (
                    <div
                      key={specialty.name}
                      className="flex items-center gap-2 rounded-2xl bg-white/45 px-2.5 py-2 ring-1 ring-white/50"
                    >
                      <IconBubble color={specialty.color} size="sm">
                        <Icon />
                      </IconBubble>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-none text-ink-400">0</p>
                        <p className="mt-0.5 max-w-[92px] truncate text-[9px] font-medium text-ink-400">
                          {specialty.name}
                        </p>
                      </div>
                    </div>
                  );
                })}
          </div>
        </StatCard>

        <HighlightCard
          tone="violet"
          className="xl:col-span-4"
          title={t('lastConsultation')}
          icon={<Stethoscope />}
          footer={
            last ? (
              <Link
                href={`/${locale}/patient/consultations/${last.id}`}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-white/80 hover:text-white"
              >
                {td('details')}
                <ArrowRight className="h-3 w-3 rtl:rotate-180" />
              </Link>
            ) : null
          }
        >
          {last ? (
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-sm font-bold">
                  {last.doctor.user.fullName.replace('Dr. ', '').slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{last.doctor.user.fullName}</p>
                  <p className="text-[11px] text-white/65">{last.doctor.specialty}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-medium leading-snug">{last.reason}</p>
              <p className="mt-1.5 text-[11px] text-white/60">
                {formatDate(last.consultedAt, locale, { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-white/70">{t('noConsultation')}</p>
          )}
        </HighlightCard>

        <HighlightCard
          tone="accent"
          className="xl:col-span-4"
          title={t('nextFollowUp')}
          icon={<CalendarDays />}
        >
          {upcoming && upcoming.followUpDate ? (
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15">
                <span className="text-2xl font-bold leading-none">
                  {formatDate(upcoming.followUpDate, locale, { day: '2-digit' })}
                </span>
                <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-white/70">
                  {formatDate(upcoming.followUpDate, locale, { month: 'short' })}
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{upcoming.doctor.user.fullName}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/70">{upcoming.doctor.specialty}</p>
                <p className="mt-1.5 line-clamp-1 text-[11px] text-white/60">{upcoming.reason}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <p className="text-sm text-white/75">{t('noFollowUp')}</p>
            </div>
          )}
        </HighlightCard>

        <HighlightCard
          tone="ink"
          className="xl:col-span-4"
          title={t('activeAccess')}
          icon={<FolderOpen />}
          footer={
            <Link
              href={`/${locale}/patient/access`}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-white/80 hover:text-white"
            >
              {t('manageAccess')}
              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </Link>
          }
        >
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/20">
              <span className="text-2xl font-bold leading-none">{activeGrants}</span>
            </div>
            <p className="text-sm leading-relaxed text-white/80">
              {t('activeAccessBody', { count: activeGrants })}
            </p>
          </div>
        </HighlightCard>

        <MiniStatCard
          className="xl:col-span-3"
          label={t('doctorsSeen')}
          value={doctors.length}
          hint={t('doctorsCount', { count: doctors.length })}
          icon={<Users />}
          href={`/${locale}/patient/consultations`}
        />
        <MiniStatCard
          className="xl:col-span-4"
          label={t('documents')}
          value={documents}
          hint={t('documentsCount', { count: documents })}
          icon={<FolderOpen />}
          tone="sky"
          href={`/${locale}/patient/consultations`}
        />
      </div>

      {/* Dossier santé */}
      <div className="mt-4 rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#E9F6F1] text-success">
              <HeartPulse className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold">{t('myHealth')}</p>
              <p className="text-[11px] text-ink-400">{patient.patientCode}</p>
            </div>
          </div>
          <Link href={`/${locale}/patient/profile`} className="link-quiet inline-flex items-center gap-1">
            {tc('edit')}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-primary-50/70 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {tp('bloodType')}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-xs font-bold text-danger">
                {patient.bloodType ?? '—'}
              </span>
              <span className="text-xs font-semibold text-ink-700">
                {patient.bloodType ? patient.bloodType : tc('notProvided')}
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-[#FDECE9] p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B56254]">
              {tp('allergies')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {patient.allergies.length > 0 ? (
                patient.allergies.slice(0, 3).map((item) => (
                  <Badge key={item} variant="red" size="sm">
                    {item}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-ink-400">{tc('none')}</span>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-[#FDF4DE] p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A8811F]">
              {tp('chronicDiseases')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {patient.chronicDiseases.length > 0 ? (
                patient.chronicDiseases.slice(0, 3).map((item) => (
                  <Badge key={item} variant="yellow" size="sm">
                    {item}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-ink-400">{tc('none')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Consultations récentes */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">{t('recent')}</h2>
          <Link
            href={`/${locale}/patient/consultations`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800"
          >
            {t('seeAll')}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        </div>

        {recent.length > 0 ? (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {recent.map((item) => (
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
        ) : (
          <EmptyState
            icon={<QrCode />}
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href={`/${locale}/patient/qr`} className="btn-violet">
                  <QrCode className="h-4 w-4" />
                  {t('openQr')}
                </Link>
                <Link href={`/${locale}/patient/claim`} className="btn-outline">
                  <ScanLine className="h-4 w-4" />
                  {t('addByCode')}
                </Link>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
