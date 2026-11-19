'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  HeartPulse,
  Lock,
  Loader2,
  Pill,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch, errorCode } from '@/lib/client';
import { cn, formatDate } from '@/lib/utils';

type Summary = {
  patientId: string;
  fullName: string;
  patientCode: string;
  birthDate: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string[];
  chronicDiseases: string[];
  scope: 'VITALS' | 'FULL';
  expiresAt: string;
};

type HistoryItem = {
  id: string;
  consultedAt: string;
  reason: string;
  diagnosis: string | null;
  doctorName: string;
  specialty: string;
};

type HistoryPage = {
  items: HistoryItem[];
  total: number;
  page: number;
  pages: number;
};

type ConsultationDetail = HistoryItem & {
  symptoms: string | null;
  examination: string | null;
  treatment: string | null;
  recommendations: string | null;
  followUpDate: string | null;
  prescriptions: Array<{
    id: string;
    medication: string;
    dosage: string;
    frequency: string;
    duration: string;
    notes: string | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    kind: string;
    createdAt: string;
  }>;
};

export function DossierView({ patientId }: { patientId: string }) {
  const t = useTranslations('doctor.dossier');
  const tpatients = useTranslations('doctor.patients');
  const td = useTranslations('doctor.form');
  const locale = useLocale();
  const router = useRouter();

  const [summary, setSummary] = useState<Summary | null | 'locked'>(null);
  const [tab, setTab] = useState<'summary' | 'history'>('history');
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const data = await apiFetch<Summary>(`/api/doctor/patients/${patientId}/summary`);
        if (!cancelled) {
          setSummary(data);
          if (data.scope === 'VITALS') setTab('summary');
        }
      } catch (err) {
        if (!cancelled && errorCode(err) === 'GRANT_REQUIRED') setSummary('locked');
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const loadHistory = useCallback(
    async (page = 1) => {
      if (summary === 'locked' || !summary || summary.scope !== 'FULL') return;
      setHistoryLoading(true);
      try {
        const data = await apiFetch<HistoryPage & { scope: string }>(
          `/api/doctor/patients/${patientId}/history?page=${page}&pageSize=10`,
        );
        setHistory((prev) =>
          page === 1 || !prev
            ? { items: data.items, total: data.total, page: data.page, pages: data.pages }
            : {
                items: [...prev.items, ...data.items],
                total: data.total,
                page: data.page,
                pages: data.pages,
              },
        );
      } catch {
        if (page === 1) setHistory({ items: [], total: 0, page: 1, pages: 1 });
      } finally {
        setHistoryLoading(false);
      }
    },
    [patientId, summary],
  );

  useEffect(() => {
    void loadHistory(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, summary]);

  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await apiFetch<ConsultationDetail>(
        `/api/doctor/patients/${patientId}/history/${id}`,
      );
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  if (summary === 'locked') {
    return (
      <div className="grid place-items-center rounded-[30px] bg-white py-16 ring-1 ring-line/70">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-accent-100 text-accent-500">
          <Lock className="h-9 w-9" />
        </span>
        <h2 className="mt-5 text-xl font-bold text-ink-900">{t('lockedTitle')}</h2>
        <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-ink-500">{t('lockedBody')}</p>
        <button
          type="button"
          onClick={() => router.push(`/${locale}/doctor/patients`)}
          className="btn mt-6 bg-ink-900 px-5 py-3 text-xs font-bold text-white"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('lockedCta')}
        </button>
      </div>
    );
  }

  if (summary === null) {
    return (
      <div className="grid h-64 place-items-center rounded-[30px] bg-white ring-1 ring-line/70">
        <Loader2 className="h-7 w-7 animate-spin text-primary-400" />
      </div>
    );
  }

  const age = summary.birthDate ? yearsOf(new Date(summary.birthDate)) : null;
  const remaining = remainingLabel(summary.expiresAt);
  void tick;

  const hasAllergies = summary.allergies.length > 0;
  const hasDiseases = summary.chronicDiseases.length > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      {/* Bandeau identité */}
      <div className="xl:col-span-4">
        <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 p-5 text-white shadow-soft">
          <span className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <Avatar name={summary.fullName} size="xl" tone="soft" className="bg-white/20 text-white" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight">{summary.fullName}</h1>
                <p className="mt-0.5 text-[11px] text-white/65">{t('patientCode')}: {summary.patientCode}</p>
              </div>
            </div>
            <Badge variant="white">{summary.scope === 'FULL' ? tpatients('scopeFull') : tpatients('scopeVitals')}</Badge>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white/10 px-2 py-3">
              <p className="text-lg font-bold leading-none">{age ?? '—'}</p>
              <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wide text-white/60">{t('age')}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-2 py-3">
              <p className="text-lg font-bold leading-none">{genderLabel(summary.gender, t)}</p>
              <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wide text-white/60">{t('gender')}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-2 py-3">
              <p className="text-lg font-bold leading-none">{summary.bloodType ?? '—'}</p>
              <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wide text-white/60">{t('bloodType')}</p>
            </div>
          </div>

          <div className="relative mt-4 flex items-center justify-between gap-2 rounded-2xl bg-black/15 px-4 py-2.5 text-[11px]">
            <span className="flex items-center gap-1.5 font-semibold text-white/85">
              <Lock className="h-3.5 w-3.5" />
              {t('readOnly')}
            </span>
            <span className="tabular-nums text-white/70">{t('remaining', { time: remaining })}</span>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/${locale}/doctor/consultations/new?patientId=${summary.patientId}&patientName=${encodeURIComponent(summary.fullName)}`,
              )
            }
            className="btn relative mt-4 w-full justify-center bg-white py-3 text-xs font-bold text-primary-700 shadow-soft hover:bg-primary-50"
          >
            <ClipboardList className="h-4 w-4" />
            {t('startConsultation')}
          </button>
        </div>

        {/* Alertes médicales */}
        <div className="mt-4 rounded-[28px] bg-[#FDEEE4] p-5 ring-1 ring-accent-200">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-accent-600" />
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-accent-600">
              {t('allergies')}
            </h3>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {hasAllergies ? (
              summary.allergies.map((item) => (
                <span key={item} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-accent-700 shadow-sm">
                  {item}
                </span>
              ))
            ) : (
              <p className="text-[11px] text-ink-500">{t('noAllergies')}</p>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-accent-600" />
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-accent-600">
              {t('chronicDiseases')}
            </h3>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {hasDiseases ? (
              summary.chronicDiseases.map((item) => (
                <span key={item} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-accent-700 shadow-sm">
                  {item}
                </span>
              ))
            ) : (
              <p className="text-[11px] text-ink-500">{t('noChronicDiseases')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="xl:col-span-8">
        <div className="mb-3 flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-line/70">
          {(
            [
              { key: 'summary', label: t('summaryTab') },
              { key: 'history', label: t('historyTab') },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 rounded-full px-4 py-2.5 text-[11px] font-bold transition-all',
                tab === key ? 'bg-primary-600 text-white shadow-soft' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'summary' ? (
          <div className="rounded-[28px] bg-white p-6 ring-1 ring-line/70">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label={t('patientCode')} value={summary.patientCode} />
              <InfoRow label={t('gender')} value={genderLabel(summary.gender, t)} />
              <InfoRow label={t('bloodType')} value={summary.bloodType ?? '—'} />
              <InfoRow
                label={t('age')}
                value={age !== null ? `${age} ${locale === 'ar' ? 'سنة' : 'ans'}` : '—'}
              />
            </div>
            <div className="mt-6 flex items-start gap-2 rounded-2xl bg-primary-50/70 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
              <span>{t('readOnly')}</span>
            </div>
          </div>
        ) : summary.scope !== 'FULL' ? (
          <div className="rounded-[28px] bg-white ring-1 ring-line/70">
            <EmptyState
              icon={<Lock className="h-6 w-6 text-ink-400" />}
              title={t('noHistoryTitle')}
              body={t('noHistoryBody')}
            />
          </div>
        ) : history === null ? (
          <div className="grid h-48 place-items-center rounded-[28px] bg-white ring-1 ring-line/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
          </div>
        ) : history.items.length === 0 ? (
          <div className="rounded-[28px] bg-white p-10 text-center ring-1 ring-line/70">
            <p className="text-sm text-ink-400">{t('noHistoryTitle')}</p>
          </div>
        ) : (
          <div className="rounded-[28px] bg-white ring-1 ring-line/70">
            <ol className="divide-y divide-line">
              {history.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(item.id)}
                    className="group flex w-full items-start gap-3 px-5 py-4 text-start transition-colors hover:bg-primary-50/40"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                      <Stethoscope className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-xs font-bold text-ink-500">
                          {formatDate(item.consultedAt, locale, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="text-[10px] text-ink-400">
                          {t('byDoctor', { doctor: item.doctorName })} · {item.specialty}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold text-ink-900">
                        {item.reason || '—'}
                      </span>
                      {item.diagnosis ? (
                        <span className="mt-0.5 block truncate text-[11px] text-ink-500">{item.diagnosis}</span>
                      ) : null}
                    </span>
                    <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                  </button>
                </li>
              ))}
            </ol>
            {history.page < history.pages ? (
              <div className="border-t border-line p-3 text-center">
                <button
                  type="button"
                  onClick={() => void loadHistory(history.page + 1)}
                  disabled={historyLoading}
                  className="text-[11px] font-bold text-primary-600 hover:text-primary-800"
                >
                  {historyLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : null}
                  {t('loadMore')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Détail en lecture seule */}
      <Dialog open={detailLoading || !!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl" hideClose>
          {detailLoading || !detail ? (
            <div className="grid h-56 place-items-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary-400" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3 pe-8">
                  <DialogTitle>{t('consultationTitle')}</DialogTitle>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-ink-500 hover:bg-primary-100"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-ink-400">
                  {t('byDoctor', { doctor: detail.doctorName })} · {detail.specialty} ·{' '}
                  {formatDate(detail.consultedAt, locale, {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </DialogHeader>

              <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
                <DetailRow icon={<CalendarDays className="h-4 w-4" />} label={td('reasonLabel')}>
                  {detail.reason || '—'}
                </DetailRow>
                <DetailRow icon={<Stethoscope className="h-4 w-4" />} label={td('symptoms')}>
                  {detail.symptoms || '—'}
                </DetailRow>
                {detail.examination ? (
                  <DetailRow icon={<ClipboardList className="h-4 w-4" />} label={td('examination')}>
                    {detail.examination}
                  </DetailRow>
                ) : null}
                <DetailRow icon={<FileText className="h-4 w-4" />} label={td('diagnosis')}>
                  {detail.diagnosis || '—'}
                </DetailRow>
                <DetailRow icon={<Pill className="h-4 w-4" />} label={td('treatmentLabel')}>
                  {detail.treatment || '—'}
                </DetailRow>
                {detail.prescriptions.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      {td('prescriptions')}
                    </p>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {detail.prescriptions.map((rx) => (
                        <li key={rx.id} className="rounded-2xl bg-primary-50/60 px-4 py-3">
                          <p className="text-xs font-bold text-ink-900">{rx.medication}</p>
                          <p className="mt-0.5 text-[11px] text-ink-500">
                            {rx.dosage} · {rx.frequency} · {rx.duration}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {detail.recommendations ? (
                  <DetailRow icon={<ClipboardList className="h-4 w-4" />} label={td('recommendations')}>
                    {detail.recommendations}
                  </DetailRow>
                ) : null}
                {detail.attachments.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      {t('attachments')}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {detail.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/api/files/${file.id}?inline=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-xs font-semibold text-ink-700 transition-colors hover:border-primary-300 hover:bg-primary-50/60"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-primary-500" />
                            <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                            <Download className="h-4 w-4 shrink-0 text-ink-400" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-primary-50/50 px-4 py-3.5 ring-1 ring-primary-100/60">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink-900">{value}</p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
        <span className="text-primary-500">{icon}</span>
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-700">{children}</p>
    </div>
  );
}

function yearsOf(date: Date): number {
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) years -= 1;
  return Math.max(0, years);
}

function remainingLabel(expiresAt: string): string {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`;
}

function genderLabel(gender: string | null, t: (key: string) => string): string {
  if (gender === 'M') return t('male');
  if (gender === 'F') return t('female');
  return '—';
}
