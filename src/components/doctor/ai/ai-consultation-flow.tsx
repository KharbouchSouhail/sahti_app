'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Check,
  Loader2,
  Mic,
  Smartphone,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch, errorCode } from '@/lib/client';
import { ConsentGate, type ConsentValues } from '@/components/doctor/ai/consent-gate';
import { AudioRecorder } from '@/components/doctor/ai/audio-recorder';

type Step = 'consent' | 'recording' | 'phone';

type PhoneSession = {
  sessionId: string;
  token: string;
  code: string;
  expiresAt: string;
  url: string;
};

export function AiConsultationFlow({
  locale,
  pendingPatient,
}: {
  locale: string;
  pendingPatient?: { patientId: string; patientName: string } | null;
}) {
  const t = useTranslations('doctor.ai.flow');
  const te = useTranslations('errors');
  const router = useRouter();

  const [step, setStep] = useState<Step>('consent');
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [maxMinutes, setMaxMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneSession, setPhoneSession] = useState<PhoneSession | null>(null);
  const [creatingPhone, setCreatingPhone] = useState(false);

  useEffect(() => {
    if (pendingPatient) {
      sessionStorage.setItem('sehhati.pendingPatient', JSON.stringify(pendingPatient));
    }
  }, [pendingPatient]);

  async function createConsultation() {
    const created = await apiFetch<{ id: string }>('/api/doctor/consultations', {
      method: 'POST',
      json: {
        creationMode: 'AI',
        patientId: pendingPatient?.patientId,
      },
    });
    setConsultationId(created.id);
    return created.id;
  }

  async function startRecording(values: ConsentValues) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = consultationId ?? (await createConsultation());
      await apiFetch(`/api/doctor/consultations/${id}/consent`, {
        method: 'POST',
        json: {
          audio: values.audio,
          aiProcessing: values.aiProcessing,
          retention: values.retention,
          patientId: pendingPatient?.patientId,
          method: 'DOCTOR_ATTESTATION',
        },
      });
      const recording = await apiFetch<{ recordingId: string; maxMinutes: number }>(
        `/api/doctor/consultations/${id}/recording`,
        { method: 'POST', json: { mimeType: 'audio/webm' } },
      );
      setRecordingId(recording.recordingId);
      setMaxMinutes(recording.maxMinutes);
      setStep('recording');
    } catch (err) {
      const code = errorCode(err);
      setError(code === 'GRANT_REQUIRED' ? te('GRANT_REQUIRED') : t('startError'));
      toast.error(code === 'GRANT_REQUIRED' ? te('GRANT_REQUIRED') : t('startError'));
    } finally {
      setBusy(false);
    }
  }

  async function refuseRecording() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = consultationId ?? (await createConsultation());
      await apiFetch(`/api/doctor/consultations/${id}/consent`, {
        method: 'POST',
        json: { patientRefused: true },
      });
      toast.success(t('refusedToast'));
      router.push(`/${locale}/doctor/consultations/${id}/edit`);
    } catch {
      setError(t('startError'));
      toast.error(t('startError'));
      setBusy(false);
    }
  }

  async function startPhone() {
    if (!consultationId || !recordingId || creatingPhone) return;
    setCreatingPhone(true);
    setError(null);
    try {
      const session = await apiFetch<PhoneSession>(
        `/api/doctor/consultations/${consultationId}/recorder-session`,
        { method: 'POST' },
      );
      setPhoneSession(session);
      setStep('phone');
    } catch {
      toast.error(t('phoneError'));
    } finally {
      setCreatingPhone(false);
    }
  }

  useEffect(() => {
    if (!phoneSession || !consultationId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        // On suit le statut de l'enregistrement côté médecin (le jeton public
        // est renouvelé lors de l'appairage par code : ne pas dépendre de lui).
        const status = await apiFetch<{
          recording: { status: string } | null;
        }>(`/api/doctor/consultations/${consultationId}/processing`);
        if (cancelled) return;
        if (status.recording?.status === 'READY') {
          router.push(`/${locale}/doctor/consultations/${consultationId}/processing`);
        }
      } catch {
        // on réessaie au prochain cycle
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phoneSession, consultationId, locale, router]);

  function finish() {
    if (!consultationId) return;
    router.push(`/${locale}/doctor/consultations/${consultationId}/processing`);
  }

  const backHref = `/${locale}/doctor/consultations/new`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {t('back')}
        </Link>
        <div className="flex items-center gap-2 text-[10px] font-semibold text-ink-400">
          <span className={step === 'consent' ? 'text-primary-700' : ''}>
            1 · {t('stepConsent')}
          </span>
          <span className="h-px w-4 bg-line" />
          <span className={step === 'recording' || step === 'phone' ? 'text-primary-700' : ''}>
            2 · {t('stepRecording')}
          </span>
          <span className="h-px w-4 bg-line" />
          <span>3 · {t('stepReview')}</span>
        </div>
      </div>

      {step === 'consent' ? (
        <ConsentGate
          onStart={(values) => void startRecording(values)}
          onRefuse={() => void refuseRecording()}
          busy={busy}
          error={error}
          patientName={pendingPatient?.patientName ?? null}
        />
      ) : null}

      {step === 'recording' && consultationId && recordingId ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] bg-primary-600 px-5 py-4 text-white shadow-soft">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="h-4 w-4" />
                {t('recordingTitle')}
              </p>
              <p className="mt-0.5 text-[11px] text-white/70">{t('recordingSubtitle')}</p>
            </div>
            <Button
              type="button"
              variant="white"
              size="sm"
              onClick={() => void startPhone()}
              disabled={creatingPhone}
            >
              {creatingPhone ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Smartphone className="h-3.5 w-3.5" />
              )}
              {t('usePhone')}
            </Button>
          </div>

          <AudioRecorder
            consultationId={consultationId}
            recordingId={recordingId}
            maxMinutes={maxMinutes}
            onFinalized={finish}
          />

          <div className="flex items-start gap-2.5 rounded-2xl bg-white/70 p-4 text-[11px] leading-relaxed text-ink-500 ring-1 ring-line/60">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <p>{t('recordingHint')}</p>
          </div>
        </div>
      ) : null}

      {step === 'phone' && phoneSession && consultationId ? (
        <div className="rounded-[30px] bg-white p-5 shadow-card ring-1 ring-line/70 sm:p-7">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-50 text-primary-600">
              <Smartphone className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-lg font-bold">{t('phoneTitle')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">{t('phoneSubtitle')}</p>

            <div className="mt-5 rounded-2xl border border-line bg-white p-3">
              <QRCodeSVG value={phoneSession.url} size={190} level="M" marginSize={0} />
            </div>

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              {t('phoneCode')}
            </p>
            <p className="ltr-code mt-1 text-2xl font-bold tracking-[0.25em]">
              {phoneSession.code}
            </p>

            <p className="mt-4 flex items-center gap-2 text-[11px] font-medium text-primary-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('phoneWaiting')}
            </p>

            <button
              type="button"
              onClick={() => setStep('recording')}
              className="mt-4 text-[11px] font-semibold text-ink-500 hover:text-primary-700"
            >
              {t('phoneBack')}
            </button>
          </div>
        </div>
      ) : null}

      {error && step !== 'consent' ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#FDECEC] px-4 py-3 text-xs font-medium text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {step === 'recording' ? (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-ink-400">
          <Check className="h-3 w-3 text-success" />
          {t('consentRecorded')}
        </p>
      ) : null}
    </div>
  );
}
