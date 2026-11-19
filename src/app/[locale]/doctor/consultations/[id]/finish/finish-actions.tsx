'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { QRScanner } from '@/components/shared/qr-scanner';
import { LogoMark } from '@/components/shared/logo';
import { CodeInput } from '@/components/ui/code-input';
import { Button } from '@/components/ui/button';
import { apiFetch, errorCode } from '@/lib/client';
import { formatDate } from '@/lib/utils';

type Mode = 'choose' | 'scan' | 'code' | 'claim' | 'success';

type ClaimData = {
  code: string;
  qrPayload: string;
  expiresAt: string;
  consultationId: string;
};

type LinkResult = {
  patientName: string;
  linkedAt: string;
};

export function FinishActions({
  consultationId,
  hasActiveClaimCode,
}: {
  consultationId: string;
  hasActiveClaimCode?: boolean;
}) {
  const t = useTranslations('doctor.finish');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [linked, setLinked] = useState<LinkResult | null>(null);
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingPatient, setPendingPatient] = useState<{
    patientId: string;
    patientName: string;
    scope: 'VITALS' | 'FULL';
  } | null>(null);
  const [pendingChecked, setPendingChecked] = useState(false);

  const tpatients = useTranslations('doctor.patients');

  useEffect(() => {
    let cancelled = false;
    async function checkPending() {
      try {
        const raw = sessionStorage.getItem('sehhati.pendingPatient');
        if (!raw) {
          setPendingChecked(true);
          return;
        }
        const pending = JSON.parse(raw) as { patientId: string; patientName: string };
        const summary = await apiFetch<{
          patientId: string;
          fullName: string;
          scope: 'VITALS' | 'FULL';
        }>(`/api/doctor/patients/${pending.patientId}/summary`);
        if (!cancelled) {
          setPendingPatient({
            patientId: pending.patientId,
            patientName: summary.fullName ?? pending.patientName,
            scope: summary.scope,
          });
        }
      } catch {
        sessionStorage.removeItem('sehhati.pendingPatient');
      } finally {
        if (!cancelled) setPendingChecked(true);
      }
    }
    void checkPending();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function linkWithGrant() {
    if (!pendingPatient || linking) return;
    setLinking(true);
    setError(null);
    try {
      const result = await apiFetch<LinkResult>(
        `/api/doctor/consultations/${consultationId}/link`,
        { method: 'POST', json: { patientId: pendingPatient.patientId } },
      );
      sessionStorage.removeItem('sehhati.pendingPatient');
      setLinked(result);
      setMode('success');
      toast.success(t('successTitle'));
      router.refresh();
    } catch (err) {
      if (errorCode(err) === 'GRANT_REQUIRED') {
        sessionStorage.removeItem('sehhati.pendingPatient');
        setPendingPatient(null);
        toast.error(te('GRANT_REQUIRED'));
      } else {
        const message = messageFor(err);
        setError(message);
        toast.error(message);
      }
    } finally {
      setLinking(false);
    }
  }

  function messageFor(err: unknown) {
    switch (errorCode(err)) {
      case 'LINK_INVALID':
        return te('LINK_INVALID');
      case 'LINK_EXPIRED':
        return te('LINK_EXPIRED');
      case 'LINK_USED':
        return te('LINK_USED');
      case 'CONSULTATION_NOT_LINKABLE':
        return te('CONSULTATION_NOT_LINKABLE');
      case 'RATE_LIMITED':
        return te('RATE_LIMITED');
      case 'NOT_FOUND':
        return te('NOT_FOUND');
      default:
        return t('linkError');
    }
  }

  async function link(raw: string) {
    const value = raw.trim();
    if (!value || linking) return;
    setLinking(true);
    setError(null);
    try {
      const result = await apiFetch<LinkResult>(
        `/api/doctor/consultations/${consultationId}/link`,
        { method: 'POST', json: { tokenOrCode: value } },
      );
      setLinked(result);
      setMode('success');
      toast.success(t('successTitle'));
      router.refresh();
    } catch (err) {
      const message = messageFor(err);
      setError(message);
      toast.error(message);
    } finally {
      setLinking(false);
    }
  }

  async function generateClaim() {
    setGenerating(true);
    setError(null);
    try {
      const result = await apiFetch<ClaimData>(
        `/api/doctor/consultations/${consultationId}/claim-code`,
        { method: 'POST' },
      );
      setClaim(result);
      setMode('claim');
    } catch (err) {
      const message = messageFor(err);
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  async function copyClaim() {
    if (!claim) return;
    try {
      await navigator.clipboard.writeText(claim.code.replace(/-/g, ''));
      setCopied(true);
      toast.success(t('codeCopied'));
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error(tc('networkError'));
    }
  }

  function reset() {
    setMode('choose');
    setCode('');
    setError(null);
  }

  const errorBanner = error ? (
    <div className="flex items-start gap-2 rounded-2xl bg-[#FDECEC] px-4 py-3 text-xs font-medium text-danger">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{error}</span>
    </div>
  ) : null;

  if (mode === 'success') {
    return (
      <div className="rounded-[30px] bg-white p-6 shadow-card ring-1 ring-line/70 sm:p-10">
        <div className="mx-auto flex max-w-md flex-col items-center text-center animate-pop">
          <span className="relative grid h-20 w-20 place-items-center rounded-full bg-[#E9F6F1]">
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-[#8FD9BE]/40" />
            <CheckCircle2 className="relative h-10 w-10 text-success" />
          </span>
          <h2 className="mt-5 text-xl font-bold">{t('successTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            {linked?.patientName
              ? t('linkSuccess', { name: linked.patientName })
              : t('linkSuccessBody')}
          </p>
          <p className="mt-1.5 text-[11px] text-ink-400">{t('linkSuccessBody')}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href={`/${locale}/doctor/consultations/${consultationId}`}
              className="btn-violet"
            >
              {t('viewConsultation')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <Link href={`/${locale}/doctor/consultations`} className="btn-outline">
              {t('backToConsultations')}
            </Link>
          </div>

          <p className="mt-6 flex items-center gap-1.5 text-[10px] text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            {t('linkedNotice')}
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'claim' && claim) {
    return (
      <div>
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {tc('back')}
          </button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generateClaim}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t('generateAnother')}
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              {t('print')}
            </Button>
          </div>
        </div>

        <div className="print-card mx-auto max-w-[440px] overflow-hidden rounded-[30px] bg-white text-ink-900 shadow-card ring-1 ring-line/70">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-[#F6F4FC] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-10 w-10 rounded-xl" />
              <div>
                <p className="font-arabic text-base font-bold leading-none text-primary-700">
                  صحتي
                </p>
                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-400">
                  Sehhati
                </p>
              </div>
            </div>
            <div className="text-end">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">
                {t('claimCodeLabel')}
              </p>
              <p className="text-[10px] font-semibold text-ink-900">{t('claimCodeTitle')}</p>
            </div>
          </div>

          <div className="flex flex-col items-center px-6 py-6 text-center">
            <div className="rounded-2xl border border-line bg-white p-3">
              <QRCodeSVG
                value={claim.qrPayload}
                size={196}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#14131C"
                marginSize={0}
              />
            </div>

            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">
              {t('orManual')}
            </p>
            <p className="ltr-code mt-1.5 text-3xl font-bold tracking-[0.18em]">{claim.code}</p>

            <div className="mt-4 w-full rounded-2xl bg-primary-50 px-4 py-3">
              <p className="text-[11px] font-semibold text-primary-700">{t('claimCodeHelp')}</p>
              <p className="mt-0.5 text-[10px] text-ink-500">
                {t('expiresAt', {
                  date: formatDate(claim.expiresAt, locale, {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </p>
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-ink-400">{t('claimCodeDesc')}</p>
          </div>

          <div className="border-t border-line px-6 py-3 text-center">
            <p className="text-[9px] font-medium text-ink-400">{t('printHint')}</p>
          </div>
        </div>

        <div className="no-print mx-auto mt-4 flex max-w-[440px] flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="soft" size="md" onClick={copyClaim}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? tc('copied') : tc('copy')}
          </Button>
          <Button type="button" variant="outline" size="md" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t('print')}
          </Button>
          <Link href={`/${locale}/doctor/consultations`} className="btn-ghost h-11 px-4 text-xs">
            {t('backToConsultations')}
          </Link>
        </div>

        {error ? <div className="no-print mx-auto mt-3 max-w-[440px]">{errorBanner}</div> : null}
      </div>
    );
  }

  if (mode === 'scan' || mode === 'code') {
    return (
      <div className="no-print rounded-[30px] bg-white p-4 shadow-card ring-1 ring-line/70 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {tc('back')}
          </button>
          <div className="flex items-center gap-1 rounded-full bg-primary-50 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('scan');
                setError(null);
              }}
              className={
                mode === 'scan'
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-primary-700 shadow-sm'
                  : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-ink-500'
              }
            >
              <Camera className="h-3.5 w-3.5" />
              {t('scanQr')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('code');
                setError(null);
              }}
              className={
                mode === 'code'
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-primary-700 shadow-sm'
                  : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-ink-500'
              }
            >
              <KeyRound className="h-3.5 w-3.5" />
              {t('enterCode')}
            </button>
          </div>
        </div>

        {mode === 'scan' ? (
          <div className="mt-4">
            <QRScanner
              onResult={(raw) => {
                if (!linking) void link(raw);
              }}
              paused={linking}
              hint={t('scanHint')}
              className="mx-auto w-full max-w-md"
            />
            <div className="mt-3 rounded-2xl bg-primary-50/70 px-4 py-3 text-center text-[11px] leading-relaxed text-ink-500">
              {t('scanInstruction')}
            </div>
            {linking ? (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-primary-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('linking')}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-100 text-primary-600">
              <KeyRound className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-bold">{t('enterCodeTitle')}</p>
            <p className="mt-1 text-[11px] text-ink-400">{t('codeHelp')}</p>

            <CodeInput
              value={code}
              onChange={(value) => {
                setCode(value);
                setError(null);
              }}
              onComplete={(value) => void link(value)}
              disabled={linking}
              autoFocus
              className="mt-5"
            />

            <Button
              type="button"
              variant="primary"
              size="lg"
              className="mt-6 w-full max-w-xs"
              onClick={() => link(code)}
              disabled={linking || code.length < 8}
            >
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              {linking ? t('linking') : t('link')}
            </Button>

            <p className="mt-4 text-[10px] text-ink-400">{t('orManual')}</p>
          </div>
        )}

        {error ? <div className="mt-4">{errorBanner}</div> : null}
      </div>
    );
  }

  return (
    <div className="no-print">
      {error ? <div className="mb-3">{errorBanner}</div> : null}

      {pendingPatient ? (
        <div className="relative mb-4 flex flex-col items-start justify-between gap-4 overflow-hidden rounded-[28px] bg-gradient-to-l from-primary-500 to-primary-700 p-5 text-white shadow-soft sm:flex-row sm:items-center">
          <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
              {t('startWithGrant', { name: pendingPatient.patientName })}
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-[#8CE0C1]">
                {pendingPatient.scope === 'FULL'
                  ? tpatients('scopeFull')
                  : tpatients('scopeVitals')}
              </span>
            </p>
            <p className="mt-1 max-w-md text-[11px] leading-relaxed text-white/75">
              {t('startWithGrantDesc', {
                scope:
                  pendingPatient.scope === 'FULL'
                    ? tpatients('scopeFull')
                    : tpatients('scopeVitals'),
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void linkWithGrant()}
            disabled={linking}
            className="relative inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-bold text-primary-700 shadow-soft transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
          >
            {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {linking ? t('startWithGrantLoading') : t('startWithGrantAction')}
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setMode('scan');
            setError(null);
          }}
          className="group relative overflow-hidden rounded-[28px] bg-primary-600 p-5 text-start text-white shadow-soft transition-transform hover:-translate-y-0.5"
        >
          <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10" />
          <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
            <Camera className="h-5 w-5" />
          </span>
          <p className="relative mt-4 text-sm font-bold">{t('scanQr')}</p>
          <p className="relative mt-1 text-[11px] leading-relaxed text-white/70">{t('scanQrDesc')}</p>
          <span className="relative mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-white/85">
            {t('scanTitle')}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('code');
            setError(null);
          }}
          className="group relative overflow-hidden rounded-[28px] bg-white p-5 text-start ring-1 ring-line/70 transition-all hover:-translate-y-0.5 hover:shadow-soft"
        >
          <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-accent-50" />
          <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-accent-100 text-accent-500">
            <KeyRound className="h-5 w-5" />
          </span>
          <p className="relative mt-4 text-sm font-bold text-ink-900">{t('enterCode')}</p>
          <p className="relative mt-1 text-[11px] leading-relaxed text-ink-500">{t('enterCodeDesc')}</p>
          <span className="relative mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-accent-500">
            {t('codeHelp')}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </span>
        </button>

        <button
          type="button"
          onClick={generateClaim}
          disabled={generating}
          className="group relative overflow-hidden rounded-[28px] bg-ink-900 p-5 text-start text-white shadow-pill transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-70"
        >
          <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/5" />
          <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
            {generating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <QrCode className="h-5 w-5" />
            )}
          </span>
          <p className="relative mt-4 flex items-center gap-2 text-sm font-bold">
            {t('generateCode')}
            {hasActiveClaimCode ? (
              <span className="rounded-full bg-[#8CE0C1]/20 px-2 py-0.5 text-[9px] font-semibold text-[#8CE0C1]">
                <Sparkles className="me-0.5 inline h-2.5 w-2.5" />
                {t('claimCodeLabel')}
              </span>
            ) : null}
          </p>
          <p className="relative mt-1 text-[11px] leading-relaxed text-white/70">
            {t('generateCodeDesc')}
          </p>
          <span className="relative mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-white/85">
            {t('print')}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </span>
        </button>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-white/70 p-4 text-[11px] leading-relaxed text-ink-500 ring-1 ring-line/60">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p>{t('claimCodeDesc')}</p>
      </div>
    </div>
  );
}
