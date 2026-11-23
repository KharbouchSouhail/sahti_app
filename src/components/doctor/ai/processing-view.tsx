'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/client';
import { cn } from '@/lib/utils';

type Job = {
  id: string;
  type: 'TRANSCRIBE' | 'EXTRACT' | 'PURGE';
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProcessingData = {
  id: string;
  status: string;
  recording: { status: string; durationSec: number; deletedAt: string | null } | null;
  transcript: { available: boolean; segments: number; language: string; purged: boolean } | null;
  extraction: { version: number; provider: string; model: string | null; warnings: number } | null;
  jobs: Job[];
  failed: boolean;
  pending: boolean;
};

type Segment = {
  id: string;
  speaker: string;
  text: string;
  start: number;
  end: number;
};

export function ProcessingView({
  consultationId,
  locale,
  initial,
}: {
  consultationId: string;
  locale: string;
  initial: ProcessingData;
}) {
  const t = useTranslations('doctor.ai.processing');
  const router = useRouter();
  const [data, setData] = useState<ProcessingData>(initial);
  const [transcript, setTranscript] = useState<{ text: string; segments: Segment[] } | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [manual, setManual] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<ProcessingData>(
        `/api/doctor/consultations/${consultationId}/processing`,
      );
      setData(next);
      if (next.status === 'AI_REVIEW') {
        router.replace(`/${locale}/doctor/consultations/${consultationId}/review`);
      }
    } catch {
      // le prochain cycle réessaiera
    }
  }, [consultationId, locale, router]);

  useEffect(() => {
    if (data.status === 'AI_REVIEW') {
      router.replace(`/${locale}/doctor/consultations/${consultationId}/review`);
      return;
    }
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, [consultationId, data.status, locale, refresh, router]);

  async function loadTranscript() {
    setLoadingTranscript(true);
    try {
      const payload = await apiFetch<{ text: string; segments: Segment[] }>(
        `/api/doctor/consultations/${consultationId}/transcript`,
      );
      setTranscript({ text: payload.text, segments: payload.segments });
      setShowTranscript(true);
    } catch {
      toast.error(t('transcriptError'));
    } finally {
      setLoadingTranscript(false);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await apiFetch(`/api/doctor/consultations/${consultationId}/processing/retry`, {
        method: 'POST',
      });
      toast.success(t('retryStarted'));
      await refresh();
    } catch {
      toast.error(t('retryError'));
    } finally {
      setRetrying(false);
    }
  }

  async function switchManual() {
    setManual(true);
    try {
      await apiFetch(`/api/doctor/consultations/${consultationId}/processing/manual`, {
        method: 'POST',
      });
      router.push(`/${locale}/doctor/consultations/${consultationId}/edit`);
    } catch {
      toast.error(t('manualError'));
      setManual(false);
    }
  }

  const recordingDone =
    data.recording?.status === 'READY' || Boolean(data.transcript?.available);
  const transcriptDone = Boolean(data.transcript?.available);
  const extractionDone = Boolean(data.extraction);

  const steps = [
    {
      key: 'recording',
      icon: <Mic className="h-4 w-4" />,
      label: t('stepRecording'),
      done: recordingDone,
      active: !recordingDone,
    },
    {
      key: 'transcription',
      icon: <FileText className="h-4 w-4" />,
      label: t('stepTranscription'),
      done: transcriptDone,
      active: recordingDone && !transcriptDone,
    },
    {
      key: 'extraction',
      icon: <Wand2 className="h-4 w-4" />,
      label: t('stepExtraction'),
      done: extractionDone,
      active: transcriptDone && !extractionDone,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white shadow-soft sm:p-8">
        <span className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
            {data.failed ? (
              <AlertTriangle className="h-6 w-6 text-[#FFD7A8]" />
            ) : (
              <>
                <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-white/20" />
                <Sparkles className="relative h-6 w-6" />
              </>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">
              {data.failed ? t('failedTitle') : t('title')}
            </h2>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-white/70">
              {data.failed ? t('failedBody') : t('subtitle')}
            </p>
          </div>
          <Badge variant="white">
            {data.failed ? t('statusFailed') : t('statusProcessing')}
          </Badge>
        </div>

        <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-2.5 rounded-2xl px-3.5 py-3 ring-1',
                step.done
                  ? 'bg-white/15 ring-white/20'
                  : step.active
                    ? 'bg-white/10 ring-white/15'
                    : 'bg-white/5 ring-white/10',
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                  step.done ? 'bg-[#8CE0C1]/20 text-[#8CE0C1]' : 'bg-white/10 text-white/70',
                )}
              >
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold">{step.label}</p>
                <p className="text-[9px] text-white/60">
                  {step.done ? t('stepDone') : step.active ? t('stepActive') : t('stepWaiting')}
                </p>
              </div>
              {step.active && !data.failed ? (
                <Loader2 className="ms-auto h-3.5 w-3.5 animate-spin text-white/70" />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {data.failed ? (
        <div className="rounded-[28px] bg-white p-5 shadow-card ring-1 ring-line/70">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#FDECEC] text-danger">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t('failureTitle')}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{t('failureBody')}</p>
              {data.jobs.find((job) => job.status === 'FAILED')?.error ? (
                <p className="mt-2 rounded-xl bg-[#FDECEC]/60 px-3 py-2 text-[10px] text-danger">
                  {data.jobs.find((job) => job.status === 'FAILED')?.error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="violet" size="md" onClick={() => void retry()} disabled={retrying}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('retry')}
            </Button>
            {transcriptDone ? (
              <Button type="button" variant="soft" size="md" onClick={() => void loadTranscript()}>
                <FileText className="h-4 w-4" />
                {t('viewTranscript')}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="md" onClick={() => void switchManual()} disabled={manual}>
              {manual ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('continueManual')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-2xl bg-white/70 p-4 text-[11px] leading-relaxed text-ink-500 ring-1 ring-line/60">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
          <p>{t('waitHint')}</p>
        </div>
      )}

      {transcript ? (
        <div className="rounded-[28px] bg-white p-5 shadow-card ring-1 ring-line/70">
          <button
            type="button"
            onClick={() => setShowTranscript((value) => !value)}
            className="flex w-full items-center justify-between gap-2 text-start"
          >
            <span className="text-sm font-bold">{t('transcriptTitle')}</span>
            <ChevronDown
              className={cn('h-4 w-4 text-ink-400 transition-transform', showTranscript && 'rotate-180')}
            />
          </button>
          {showTranscript ? (
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pe-1">
              {transcript.segments.map((segment) => (
                <div key={segment.id} className="rounded-xl bg-primary-50/50 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-primary-600">
                    {segment.speaker} · {Math.floor(segment.start / 60)}:
                    {String(segment.start % 60).padStart(2, '0')}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-700">{segment.text}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : data.transcript?.available ? (
        <button
          type="button"
          onClick={() => void loadTranscript()}
          className="inline-flex items-center gap-2 text-[11px] font-semibold text-primary-600 hover:text-primary-800"
        >
          {loadingTranscript ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {t('viewTranscript')}
        </button>
      ) : null}
    </div>
  );
}
