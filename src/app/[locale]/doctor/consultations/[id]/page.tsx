import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  HeartPulse,
  Link2,
  Paperclip,
  Pill,
  QrCode,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getActiveGrant } from '@/lib/access';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { PrintButton } from '@/components/shared/print-button';
import { formatBytes } from '@/lib/files';
import { formatDate, formatDateTime, maskName } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Section({
  icon,
  title,
  children,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  tone?: 'accent' | 'primary' | 'success';
}) {
  return (
    <section className="print-card rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={
            tone === 'accent'
              ? 'grid h-8 w-8 place-items-center rounded-xl bg-accent-100 text-accent-500 [&>svg]:h-4 [&>svg]:w-4'
              : tone === 'success'
                ? 'grid h-8 w-8 place-items-center rounded-xl bg-[#E9F6F1] text-success [&>svg]:h-4 [&>svg]:w-4'
                : 'grid h-8 w-8 place-items-center rounded-xl bg-primary-50 text-primary-500 [&>svg]:h-4 [&>svg]:w-4'
          }
        >
          {icon}
        </span>
        <h2 className="text-sm font-bold text-ink-900">{title}</h2>
      </div>
      <div className="text-sm leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

export default async function DoctorConsultationDetail({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.detail' });
  const tf = await getTranslations({ locale, namespace: 'doctor.form' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const tm = await getTranslations({ locale, namespace: 'linkMethod' });
  const tfq = await getTranslations({ locale, namespace: 'doctor.finish' });

  const data = await getSessionUser();
  const doctor = data!.user.doctor!;

  const consultation = await prisma.consultation.findFirst({
    where: { id, doctorId: doctor.id },
    include: {
      patient: { include: { user: { select: { fullName: true } } } },
      prescriptions: { orderBy: { position: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
      claimCode: { select: { expiresAt: true, usedAt: true } },
    },
  });

  if (!consultation) {
    return (
      <div>
        <div className="mb-4">

          <Link
            href={`/${locale}/doctor/consultations`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {t('back')}
          </Link>
        </div>
        <EmptyState
          icon={<FileText />}
          title={tc('noData')}
          body={t('completeFirst')}
          action={
            <Link href={`/${locale}/doctor/consultations`} className="btn-violet">
              {t('back')}
            </Link>
          }
        />
      </div>
    );
  }

  const grantActive = consultation.patientId
    ? !!(await getActiveGrant(doctor.id, consultation.patientId))
    : false;

  const kindLabel = (kind: string) => {
    if (kind === 'LAB') return tf('kindLAB');
    if (kind === 'IMAGING') return tf('kindIMAGING');
    if (kind === 'PRESCRIPTION') return tf('kindPRESCRIPTION');
    return tf('kindOTHER');
  };

  const status = consultation.status;
  const primaryHref =
    status === 'DRAFT'
      ? `/${locale}/doctor/consultations/${consultation.id}/edit`
      : status === 'COMPLETED'
        ? `/${locale}/doctor/consultations/${consultation.id}/finish`
        : null;

  const statusNote =
    status === 'DRAFT'
      ? { icon: <Clock3 />, text: t('statusDraft'), tone: 'bg-[#FDF4DE] text-[#8A6A18]' }
      : status === 'COMPLETED'
        ? { icon: <Link2 />, text: t('statusCompleted'), tone: 'bg-primary-50 text-primary-700' }
        : { icon: <CheckCircle2 />, text: t('statusLinked'), tone: 'bg-[#E9F6F1] text-success' };

  return (
    <div className="animate-fade-up">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${locale}/doctor/consultations`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {t('back')}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {status !== 'LINKED' ? (
            <Link
              href={`/${locale}/doctor/consultations/${consultation.id}/edit`}
              className="btn-outline h-9 px-4 text-xs"
            >
              {t('edit')}
            </Link>
          ) : null}
          {primaryHref ? (
            <Link
              href={primaryHref}
              className={
                status === 'COMPLETED'
                  ? 'btn-violet h-9 px-4 text-xs'
                  : 'btn-primary h-9 px-4 text-xs'
              }
            >
              {status === 'COMPLETED' ? <Link2 className="h-3.5 w-3.5" /> : null}
              {status === 'COMPLETED' ? t('linkNow') : t('edit')}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          ) : null}
          <PrintButton label={tc('print')} />
        </div>
      </div>

      <article className="print-area">
        <div className="mb-4 hidden items-center justify-between border-b border-line pb-4 print:flex">
          <div>
            <p className="font-arabic text-xl font-bold text-primary-700">صحتي · Sehhati</p>
            <p className="text-[10px] text-ink-400">{t('title')}</p>
          </div>
          <div className="text-end text-[10px] text-ink-500">
            <p className="font-semibold text-ink-900">{data!.user.fullName}</p>
            <p>{doctor.specialty}</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[30px] bg-primary-600 p-6 text-white shadow-soft sm:p-7">
          <span className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-accent-400/15" />

          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                  {t('consultedOn')}
                </span>
                <StatusBadge status={status} />
              </div>
              <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-[28px]">
                {consultation.reason || '—'}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
                  <CalendarDays className="h-3 w-3" />
                  {formatDate(consultation.consultedAt, locale, {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                {consultation.patient ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
                    <UserRound className="h-3 w-3" />
                    {maskName(consultation.patient.user.fullName)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
                    <QrCode className="h-3 w-3" />
                    {t('notLinked')}
                  </span>
                )}
                {consultation.linkedAt && consultation.linkMethod ? (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
                    {tm(consultation.linkMethod)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
              <Avatar name={data!.user.fullName} src={data!.user.avatarUrl} size="lg" tone="peach" />
              <div className="hidden sm:block">
                <p className="text-xs font-bold">{data!.user.fullName}</p>
                <p className="text-[10px] text-white/60">{doctor.specialty}</p>
                {doctor.clinicName ? (
                  <p className="mt-0.5 text-[10px] text-white/50">{doctor.clinicName}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className={`no-print mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3 ${statusNote.tone}`}>
          <span className="mt-0.5 [&>svg]:h-4 [&>svg]:w-4">{statusNote.icon}</span>
          <div className="flex-1">
            <p className="text-xs font-semibold">{statusNote.text}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {consultation.diagnosis ? (
              <section className="print-card rounded-3xl bg-[#FDF7F3] p-5 shadow-card ring-1 ring-accent-100">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-100 text-accent-500">
                    <HeartPulse className="h-4 w-4" />
                  </span>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-600/80">
                    {tf('diagnosis')}
                  </p>
                </div>
                <p className="mt-3 text-base font-semibold leading-relaxed text-ink-900">
                  {consultation.diagnosis}
                </p>
              </section>
            ) : null}

            {consultation.symptoms ? (
              <Section icon={<FileText />} title={tf('symptoms')}>
                <p className="whitespace-pre-line">{consultation.symptoms}</p>
              </Section>
            ) : null}

            {consultation.examination ? (
              <Section icon={<Stethoscope />} title={tf('examination')}>
                <p className="whitespace-pre-line">{consultation.examination}</p>
              </Section>
            ) : null}

            {consultation.treatment ? (
              <Section icon={<Pill />} title={tf('treatmentLabel')} tone="success">
                <p className="whitespace-pre-line">{consultation.treatment}</p>
              </Section>
            ) : null}

            <Section icon={<Pill />} title={tf('prescriptions')} tone="accent">
              {consultation.prescriptions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-start text-[10px] uppercase tracking-wider text-ink-400">
                        <th className="pb-2 text-start font-semibold">{tf('medication')}</th>
                        <th className="pb-2 text-start font-semibold">{tf('dosage')}</th>
                        <th className="pb-2 text-start font-semibold">{tf('frequency')}</th>
                        <th className="pb-2 text-start font-semibold">{tf('duration')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {consultation.prescriptions.map((med) => (
                        <tr key={med.id}>
                          <td className="py-2.5 pe-3 font-semibold text-ink-900">
                            {med.medication}
                            {med.notes ? (
                              <p className="mt-0.5 text-[10px] font-normal text-ink-400">{med.notes}</p>
                            ) : null}
                          </td>
                          <td className="py-2.5 pe-3">{med.dosage}</td>
                          <td className="py-2.5 pe-3">{med.frequency}</td>
                          <td className="py-2.5">{med.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-400">{tf('noPrescriptions')}</p>
              )}
            </Section>

            {consultation.recommendations ? (
              <Section icon={<ShieldCheck />} title={tf('recommendations')} tone="success">
                <p className="whitespace-pre-line">{consultation.recommendations}</p>
              </Section>
            ) : null}
          </div>

          <aside className="space-y-4 lg:col-span-4">
            <div className="print-card rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70">
              <p className="text-xs font-bold text-ink-900">{t('patient')}</p>
              {consultation.patient ? (
                <div className="mt-3 flex items-center gap-3">
                  <Avatar
                    name={consultation.patient.user.fullName}
                    size="lg"
                    tone="mint"
                    className="h-12 w-12"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900">
                      {consultation.patient.user.fullName}
                    </p>
                    <p className="ltr-code mt-0.5 text-[10px] text-ink-400">
                      {consultation.patient.patientCode}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-ink-400">{t('notLinked')}</p>
              )}

              <div className="mt-4 space-y-2 border-t border-line pt-3 text-[11px] text-ink-500">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-ink-300" />
                  {t('createdOn', { date: formatDate(consultation.createdAt, locale) })}
                </p>
                {consultation.linkedAt ? (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    {formatDateTime(consultation.linkedAt, locale)}
                  </p>
                ) : null}
              </div>
            </div>

            {consultation.claimCode && !consultation.claimCode.usedAt ? (
              <div className="print-card rounded-3xl bg-primary-50 p-5 ring-1 ring-primary-100/60">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-primary-600" />
                  <p className="text-xs font-bold text-ink-900">{tfq('claimCodeLabel')}</p>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                  {t('codeExpires', { date: formatDate(consultation.claimCode.expiresAt, locale) })}
                </p>
              </div>
            ) : null}

            <div className="print-card rounded-3xl bg-primary-50 p-5 ring-1 ring-primary-100/60">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary-600" />
                <p className="text-xs font-bold text-ink-900">{tf('followUpDate')}</p>
              </div>
              {consultation.followUpDate ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-primary-700 shadow-sm">
                    <span className="text-lg font-bold leading-none">
                      {formatDate(consultation.followUpDate, locale, { day: '2-digit' })}
                    </span>
                    <span className="mt-0.5 text-[8px] font-semibold uppercase">
                      {formatDate(consultation.followUpDate, locale, { month: 'short' })}
                    </span>
                  </span>
                  <p className="text-xs font-medium text-ink-700">
                    {formatDate(consultation.followUpDate, locale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-ink-400">{tc('none')}</p>
              )}
            </div>

            <div className="print-card rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary-500" />
                  <p className="text-xs font-bold text-ink-900">{tf('attachments')}</p>
                </div>
                <Badge variant="gray">{consultation.attachments.length}</Badge>
              </div>

              {consultation.attachments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {consultation.attachments.map((file) => (
                    <a
                      key={file.id}
                      href={`/api/files/${file.id}`}
                      className="flex items-center gap-2.5 rounded-2xl bg-primary-50/70 p-2.5 transition-colors hover:bg-primary-100/70"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-sm">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-ink-900">
                          {file.fileName}
                        </span>
                        <span className="text-[9px] text-ink-400">
                          {kindLabel(file.kind)} · {formatBytes(file.sizeBytes)}
                        </span>
                      </span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-ink-400">{tf('noAttachments')}</p>
              )}
            </div>

            <div className="no-print flex items-start gap-2 rounded-2xl bg-white/70 p-3 text-[10px] leading-relaxed text-ink-400 ring-1 ring-line/60">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              {grantActive ? t('securityNoteActive') : t('securityNote')}
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}
