'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  ClipboardList,
  HeartPulse,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { QRDisplay } from '@/components/shared/qr-display';
import { apiFetch, errorCode } from '@/lib/client';
import { formatCountdown, formatTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Scope = 'LINK_ONLY' | 'VITALS' | 'FULL';
type DurationMin = 60 | 120 | 1440;

type TokenData = {
  qrPayload: string;
  code: string;
  expiresAt: string;
  scope: Scope;
  durationMin: number;
};

type LinkStatus = {
  status: 'none' | 'active' | 'expired' | 'used';
  expiresAt?: string;
  usedAt?: string;
  consultationId?: string | null;
  doctorName?: string | null;
  scope?: Scope;
  grantExpiresAt?: string | null;
};

const TOTAL_SECONDS = 5 * 60;

const SCOPES: Array<{
  scope: Scope;
  icon: typeof ClipboardList;
  titleKey: string;
  bodyKey: string;
}> = [
  { scope: 'LINK_ONLY', icon: ClipboardList, titleKey: 'scopeLinkOnlyTitle', bodyKey: 'scopeLinkOnlyBody' },
  { scope: 'VITALS', icon: HeartPulse, titleKey: 'scopeVitalsTitle', bodyKey: 'scopeVitalsBody' },
  { scope: 'FULL', icon: ShieldCheck, titleKey: 'scopeFullTitle', bodyKey: 'scopeFullBody' },
];

const DURATIONS: Array<{ value: DurationMin; labelKey: string }> = [
  { value: 60, labelKey: 'duration60' },
  { value: 120, labelKey: 'duration120' },
  { value: 1440, labelKey: 'duration1440' },
];

export function QrPanel() {
  const t = useTranslations('patient.qr');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [choice, setChoice] = useState<{ scope: Scope; durationMin: DurationMin } | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [durationMin, setDurationMin] = useState<DurationMin>(120);

  const [data, setData] = useState<TokenData | null>(null);
  const [status, setStatus] = useState<'loading' | 'active' | 'expired' | 'used' | 'error'>('loading');
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const [total, setTotal] = useState(TOTAL_SECONDS);
  const [linked, setLinked] = useState<{
    consultationId: string | null;
    doctorName: string | null;
    grantExpiresAt: string | null;
    scope: Scope | null;
  } | null>(null);

  const generate = useCallback(
    async (picked: { scope: Scope; durationMin: DurationMin }) => {
      setStatus('loading');
      setLinked(null);
      try {
        const token = await apiFetch<TokenData>('/api/patient/link-token', {
          method: 'POST',
          json: picked,
        });
        setData(token);
        setChoice(picked);
        const seconds = Math.max(
          1,
          Math.floor((new Date(token.expiresAt).getTime() - Date.now()) / 1000),
        );
        setTotal(seconds > 0 ? Math.min(TOTAL_SECONDS, seconds) : TOTAL_SECONDS);
        setRemaining(seconds);
        setStatus('active');
      } catch (error) {
        setStatus('error');
        toast.error(
          errorCode(error) === 'RATE_LIMITED' ? t('generateError') : t('generateError'),
        );
      }
    },
    [t],
  );

  useEffect(() => {
    if (status !== 'active') return;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'active') return;
    const poll = setInterval(async () => {
      try {
        const result = await apiFetch<LinkStatus>('/api/patient/link-token');
        if (result.status === 'used') {
          setLinked({
            consultationId: result.consultationId ?? null,
            doctorName: result.doctorName ?? null,
            grantExpiresAt: result.grantExpiresAt ?? null,
            scope: result.scope ?? null,
          });
          setStatus('used');
        } else if (result.status === 'expired') {
          setStatus('expired');
        }
      } catch {
        // le polling réessaiera
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [status]);

  const circumference = 2 * Math.PI * 22;
  const ratio = total > 0 ? Math.max(0, remaining) / total : 0;

  const scopeBadgeKey =
    choice?.scope === 'VITALS'
      ? 'scopeVitalsBadge'
      : choice?.scope === 'FULL'
        ? 'scopeFullBadge'
        : 'scopeLinkOnlyBadge';

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7">
        {choice === null ? (
          <ScopeChoice
            scope={scope}
            setScope={setScope}
            durationMin={durationMin}
            setDurationMin={setDurationMin}
            onGenerate={() => {
              if (scope) generate({ scope, durationMin });
            }}
          />
        ) : (
          <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 p-5 text-white shadow-soft sm:p-7">
            <span className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10" />
            <span className="pointer-events-none absolute -bottom-28 -left-16 h-60 w-60 rounded-full bg-accent-400/15 blur-2xl" />
            <span className="pointer-events-none absolute right-10 top-1/2 h-28 w-28 rounded-full border border-white/10" />

            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                  {t('title')}
                </p>
                <h2 className="mt-1.5 text-xl font-bold sm:text-2xl">
                  {status === 'used' ? t('successTitle') : t('showToDoctor')}
                </h2>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[10px] font-semibold text-white/85 ring-1 ring-white/20">
                  <ShieldCheck className="h-3 w-3 text-accent-300" />
                  {t(scopeBadgeKey)}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-semibold">
                {status === 'used' ? (
                  <>
                    <Check className="h-3 w-3 text-[#8CE0C1]" />
                    {t('successTitle')}
                  </>
                ) : status === 'expired' ? (
                  <>
                    <Clock3 className="h-3 w-3 text-accent-300" />
                    {tc('expired')}
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8CE0C1] opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8CE0C1]" />
                    </span>
                    {t('waiting')}
                  </>
                )}
              </span>
            </div>

            <div className="relative mt-6 flex flex-col items-center">
              {status === 'loading' ? (
                <div className="grid h-[290px] w-full max-w-[290px] place-items-center rounded-[30px] bg-white/10">
                  <div className="flex flex-col items-center gap-3 text-white/70">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <span className="text-xs">{tc('loading')}</span>
                  </div>
                </div>
              ) : status === 'used' ? (
                <div className="flex w-full flex-col items-center py-8 text-center animate-pop">
                  <span className="relative grid h-20 w-20 place-items-center rounded-full bg-white/15">
                    <span className="absolute inset-0 animate-pulse-ring rounded-full bg-[#8CE0C1]/30" />
                    <CheckCircle2 className="relative h-10 w-10 text-[#8CE0C1]" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold">{t('successTitle')}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/70">
                    {linked?.grantExpiresAt ? (
                      t('accessGranted', { time: formatTime(linked.grantExpiresAt, locale) })
                    ) : linked?.doctorName ? (
                      t('successBody', { doctor: linked.doctorName })
                    ) : (
                      t('scanOrCode')
                    )}
                  </p>
                  {linked?.grantExpiresAt && linked.doctorName ? (
                    <p className="mt-1.5 max-w-xs text-xs text-white/60">
                      {t('accessOpenUntil', {
                        doctor: linked.doctorName,
                        time: formatTime(linked.grantExpiresAt, locale),
                      })}
                    </p>
                  ) : null}
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {linked?.consultationId ? (
                      <Link
                        href={`/${locale}/patient/consultations/${linked.consultationId}`}
                        className="btn bg-white px-5 py-2.5 text-primary-700 shadow-soft hover:bg-primary-50"
                      >
                        {t('viewConsultation')}
                      </Link>
                    ) : null}
                    {linked?.grantExpiresAt ? (
                      <Link
                        href={`/${locale}/patient/access`}
                        className="btn bg-white/15 px-5 py-2.5 text-white hover:bg-white/25"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {locale === 'ar' ? 'الوصول إلى ملفي' : 'Accès à mon dossier'}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setChoice(null)}
                      className="btn bg-white/10 px-5 py-2.5 text-white hover:bg-white/20"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t('backToChoice')}
                    </button>
                  </div>
                </div>
              ) : status === 'error' ? (
                <div className="flex w-full flex-col items-center py-12 text-center">
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10">
                    <QrCode className="h-7 w-7 text-white/70" />
                  </span>
                  <p className="mt-4 text-sm font-semibold">{t('generateError')}</p>
                  <button
                    type="button"
                    onClick={() => generate(choice)}
                    className="btn mt-4 bg-white px-5 py-2.5 text-primary-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {tc('retry')}
                  </button>
                </div>
              ) : (
                <div className={status === 'expired' ? 'relative opacity-40 blur-[3px]' : ''}>
                  <QRDisplay
                    value={data?.qrPayload ?? 'sehhati://link'}
                    code={data?.code}
                    size={216}
                    hint={status === 'active' ? t('secureNote') : undefined}
                  />
                </div>
              )}

              {status === 'expired' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
                    <Clock3 className="h-6 w-6 text-accent-300" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{t('expiredTitle')}</h3>
                  <p className="mt-1 max-w-[240px] text-xs text-white/70">{t('expiredBody')}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => generate(choice)}
                      className="btn bg-white px-5 py-2.5 text-primary-700 shadow-soft hover:bg-primary-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t('regenerate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChoice(null)}
                      className="btn bg-white/15 px-5 py-2.5 text-white hover:bg-white/25"
                    >
                      {t('backToChoice')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {status === 'active' && data ? (
              <div className="relative mt-6 flex flex-col items-center gap-3 border-t border-white/15 pt-5 sm:flex-row sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative grid h-14 w-14 place-items-center">
                    <svg viewBox="0 0 52 52" className="h-14 w-14 -rotate-90">
                      <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="4" />
                      <circle
                        cx="26"
                        cy="26"
                        r="22"
                        fill="none"
                        stroke={remaining < 60 ? '#F7926B' : '#8CE0C1'}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - ratio)}
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <span className="absolute text-[11px] font-bold tabular-nums">
                      {formatCountdown(remaining)}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/50">{t('expiresIn')}</p>
                    <p className="text-sm font-bold">
                      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChoice(null)}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    {t('backToChoice')}
                  </button>
                  <button
                    type="button"
                    onClick={() => generate(choice)}
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/25"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('regenerate')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-3 lg:col-span-5">
        <div className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-100 text-primary-600">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold">{locale === 'ar' ? 'كيف يعمل؟' : 'Comment ça marche ?'}</h3>
          </div>
          <ol className="mt-4 space-y-3.5">
            {[
              {
                icon: QrCode,
                title: locale === 'ar' ? 'اعرض رمزك' : 'Affichez votre code',
                body: t('instruction'),
              },
              {
                icon: ScanLine,
                title: locale === 'ar' ? 'يمسحه الطبيب' : 'Le médecin le scanne',
                body: t('scanOrCode'),
              },
              {
                icon: CheckCircle2,
                title: locale === 'ar' ? 'تُضاف الاستشارة' : 'La consultation apparaît',
                body:
                  locale === 'ar'
                    ? 'تُضاف مباشرة إلى ملفك مع الصلاحيات التي اخترتها.'
                    : 'Elle est ajoutée à votre historique, avec les droits que vous avez choisis.',
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
                  <step.icon className="h-4 w-4" />
                  <span className="absolute -end-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary-600 text-[8px] font-bold text-white">
                    {index + 1}
                  </span>
                </span>
                <div className="pt-0.5">
                  <p className="text-xs font-bold text-ink-900">{step.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-3xl bg-[#E9F6F1] p-5 ring-1 ring-[#D8F0E7]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success" />
            <p className="text-xs font-bold text-ink-900">{t('secureNote')}</p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            {locale === 'ar'
              ? 'ينتهي الرمز بعد 5 دقائق ويُلغى بعد أول استعمال. يمكنك إلغاء الوصول من «الوصول إلى ملفي» في أي وقت.'
              : 'Le code expire après 5 minutes et devient inutilisable après le premier scan. Vous pouvez révoquer l’accès depuis « Accès à mon dossier » à tout moment.'}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-3xl bg-white p-4 ring-1 ring-line/70">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-100 text-accent-500">
              <BellRing className="h-4 w-4" />
            </span>
            <p className="text-xs font-semibold text-ink-700">
              {locale === 'ar' ? 'لديك رمز تسليم من الطبيب؟' : 'Vous avez un code de remise ?'}
            </p>
          </div>
          <Link href={`/${locale}/patient/claim`} className="text-[11px] font-bold text-primary-600 hover:text-primary-800">
            {tc('add')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ScopeChoice({
  scope,
  setScope,
  durationMin,
  setDurationMin,
  onGenerate,
}: {
  scope: Scope | null;
  setScope: (scope: Scope) => void;
  durationMin: DurationMin;
  setDurationMin: (value: DurationMin) => void;
  onGenerate: () => void;
}) {
  const t = useTranslations('patient.qr');
  const locale = useLocale();

  return (
    <div className="relative overflow-hidden rounded-[32px] bg-white p-5 shadow-soft ring-1 ring-line/70 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-100 text-primary-600">
          <Wand2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-500">
            {t('title')}
          </p>
          <h2 className="mt-0.5 text-xl font-bold text-ink-900">{t('chooseScopeTitle')}</h2>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-500">{t('chooseScopeSubtitle')}</p>

      <div className="mt-5 grid gap-3">
        {SCOPES.map(({ scope: value, icon: Icon, titleKey, bodyKey }) => {
          const selected = scope === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              aria-pressed={selected}
              className={cn(
                'group flex items-start gap-4 rounded-3xl border-2 p-4 text-start transition-all duration-200',
                selected
                  ? 'border-primary-500 bg-primary-50/70 shadow-soft'
                  : 'border-transparent bg-ink-50/60 hover:border-primary-200 hover:bg-primary-50/40',
              )}
            >
              <span
                className={cn(
                  'grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors',
                  selected ? 'bg-primary-600 text-white' : 'bg-white text-primary-500 shadow-sm',
                )}
              >
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink-900">{t(titleKey)}</span>
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-all',
                      selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-white',
                    )}
                  >
                    {selected ? <Check className="h-3 w-3" /> : null}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-ink-500">{t(bodyKey)}</span>
                {value === 'FULL' ? (
                  <span className="mt-2 flex items-start gap-1.5 rounded-2xl bg-accent-50 px-3 py-2 text-[10px] leading-relaxed text-accent-700">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                    {t('scopeFullWarning')}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {scope && scope !== 'LINK_ONLY' ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            {t('durationLabel')}
          </p>
          <div className="mt-2 flex gap-2">
            {DURATIONS.map(({ value, labelKey }) => (
              <button
                key={value}
                type="button"
                onClick={() => setDurationMin(value)}
                aria-pressed={durationMin === value}
                className={cn(
                  'flex-1 rounded-2xl border px-3 py-2.5 text-xs font-bold transition-all',
                  durationMin === value
                    ? 'border-primary-600 bg-primary-600 text-white shadow-soft'
                    : 'border-line bg-white text-ink-600 hover:border-primary-300',
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onGenerate}
        disabled={!scope}
        className="btn mt-6 w-full justify-center bg-ink-900 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <QrCode className="h-5 w-5" />
        {t('generateQr')}
      </button>
      <p className="mt-2.5 text-center text-[10px] text-ink-400">
        {locale === 'ar'
          ? 'اختر نطاق المشاركة ثم أنشئ رمزك — المريض يبقى هو صاحب القرار.'
          : 'Choisissez une portée puis générez votre QR — c’est vous qui décidez.'}
      </p>
    </div>
  );
}
