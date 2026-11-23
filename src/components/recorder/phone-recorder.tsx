'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Mic, TriangleAlert } from 'lucide-react';
import { apiFetch } from '@/lib/client';
import { AudioRecorder } from '@/components/doctor/ai/audio-recorder';

type SessionInfo = {
  valid: boolean;
  recordingId?: string;
  status?: string;
  maxMinutes?: number;
};

export function PhoneRecorder({
  sessionId,
  token,
  locale,
}: {
  sessionId: string;
  token: string;
  locale: string;
}) {
  const t = useTranslations('recorder');
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<SessionInfo>(
          `/api/recorder-sessions/${sessionId}?token=${encodeURIComponent(token)}`,
        );
        if (!cancelled) setInfo(data);
      } catch {
        if (!cancelled) setInfo({ valid: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-md rounded-[30px] bg-white p-10 text-center shadow-card ring-1 ring-line/70">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary-500" />
        <p className="mt-3 text-xs text-ink-500">{t('loading')}</p>
      </div>
    );
  }

  if (!info?.valid) {
    return (
      <div className="mx-auto max-w-md rounded-[30px] bg-white p-8 text-center shadow-card ring-1 ring-line/70">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FDECEC] text-danger">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold">{t('invalidTitle')}</h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-500">{t('invalidBody')}</p>
        <a href={`/${locale}/recorder`} className="btn-violet mt-5 inline-flex">
          {t('pairAgain')}
        </a>
      </div>
    );
  }

  if (done || info.status === 'READY') {
    return (
      <div className="mx-auto max-w-md rounded-[30px] bg-white p-8 text-center shadow-card ring-1 ring-line/70">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#E9F6F1] text-success">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold">{t('sentTitle')}</h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-500">{t('sentBody')}</p>
        <p className="mt-4 rounded-2xl bg-primary-50/70 px-4 py-3 text-[10px] leading-relaxed text-ink-500">
          {t('closeHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-[28px] bg-primary-600 px-5 py-4 text-white shadow-soft">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Mic className="h-4 w-4" />
          {t('sessionTitle')}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/70">{t('sessionSubtitle')}</p>
      </div>

      <AudioRecorder
        recordingId={info.recordingId ?? sessionId}
        maxMinutes={info.maxMinutes ?? 60}
        remote={{ sessionId, token }}
        onFinalized={() => setDone(true)}
      />
    </div>
  );
}
