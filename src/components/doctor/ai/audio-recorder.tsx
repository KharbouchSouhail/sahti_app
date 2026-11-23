'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatCountdown } from '@/lib/utils';
import {
  deleteBufferedChunks,
  listBufferedChunks,
  saveChunkToIdb,
} from '@/lib/recording-idb';
import { cn } from '@/lib/utils';

type RecorderStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'uploading' | 'finished' | 'error';

type RecorderMeta = {
  recordingId: string;
  chunkCount: number;
  durationSec: number;
  mimeType: string;
  startedAt: number;
};

export function AudioRecorder({
  consultationId,
  recordingId,
  maxMinutes,
  remote,
  onFinalized,
  onCancel,
  autoStart = false,
}: {
  consultationId?: string;
  recordingId: string;
  maxMinutes: number;
  remote?: { sessionId: string; token: string };
  onFinalized: () => void;
  onCancel?: () => void;
  autoStart?: boolean;
}) {
  const t = useTranslations('doctor.ai.recorder');
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [silentFor, setSilentFor] = useState(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resumeMeta, setResumeMeta] = useState<RecorderMeta | null>(null);
  const [resuming, setResuming] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pauseStartedRef = useRef(0);
  const elapsedRef = useRef(0);
  const lastSoundRef = useRef(Date.now());
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef<Promise<void>[]>([]);
  const finalizedRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const statusRef = useRef<RecorderStatus>('idle');
  const finishingRef = useRef(false);

  const metaKey = `sehhati.recording.${recordingId}`;
  const maxSeconds = Math.max(1, maxMinutes * 60);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const chunkUrl = useCallback(
    (index: number) =>
      remote
        ? `/api/recorder-sessions/${remote.sessionId}/chunks/${index}?token=${encodeURIComponent(remote.token)}`
        : `/api/doctor/consultations/${consultationId}/recording/${recordingId}/chunks/${index}`,
    [consultationId, recordingId, remote],
  );

  const finalizeUrl = useCallback(
    () =>
      remote
        ? `/api/recorder-sessions/${remote.sessionId}/finalize?token=${encodeURIComponent(remote.token)}`
        : `/api/doctor/consultations/${consultationId}/recording/${recordingId}/finalize`,
    [consultationId, recordingId, remote],
  );

  const saveMeta = useCallback(
    (durationSec: number) => {
      try {
        const meta: RecorderMeta = {
          recordingId,
          chunkCount: chunkIndexRef.current,
          durationSec,
          mimeType: mimeTypeRef.current,
          startedAt: startedAtRef.current,
        };
        localStorage.setItem(metaKey, JSON.stringify(meta));
      } catch {
        // stockage local indisponible
      }
    },
    [metaKey, recordingId],
  );

  const clearLocal = useCallback(async () => {
    try {
      localStorage.removeItem(metaKey);
    } catch {
      // ignore
    }
    try {
      await deleteBufferedChunks(recordingId);
    } catch {
      // ignore
    }
  }, [metaKey, recordingId]);

  const uploadChunk = useCallback(
    async (index: number, blob: Blob) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(chunkUrl(index), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: blob,
          });
          if (response.ok || response.status === 409) {
            setUploadedCount((count) => Math.max(count, index + 1));
            return true;
          }
        } catch {
          // nouvelle tentative
        }
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
      setErrorCode('UPLOAD_FAILED');
      return false;
    },
    [chunkUrl],
  );

  const enqueueUpload = useCallback(
    (index: number, blob: Blob) => {
      uploadChainRef.current = uploadChainRef.current.then(async () => {
        await uploadChunk(index, blob);
      });
      return uploadChainRef.current;
    },
    [uploadChunk],
  );

  const finalize = useCallback(
    async (chunkTotal: number, durationSec: number, mimeType: string) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      setStatus('uploading');
      try {
        const response = await fetch(finalizeUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkCount: chunkTotal, durationSec, mimeType }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error?.code ?? 'FINALIZE_FAILED');
        }
        await clearLocal();
        setStatus('finished');
        toast.success(t('sent'));
        onFinalized();
      } catch (error) {
        finalizedRef.current = false;
        setErrorCode(error instanceof Error ? error.message : 'FINALIZE_FAILED');
        setStatus('error');
      }
    },
    [clearLocal, finalizeUrl, onFinalized, t],
  );

  const releaseResources = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    timerRef.current = null;
    levelTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  const stopEverything = useCallback(async () => {
    releaseResources();
    try {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    } catch {
      // ignore
    }
  }, [releaseResources]);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      finishingRef.current = false;
      return;
    }
    setStatus('uploading');
    try {
      recorder.stop();
    } catch {
      finishingRef.current = false;
      setErrorCode('STOP_FAILED');
      setStatus('error');
    }
  }, []);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.fftSize);

      levelTimerRef.current = setInterval(() => {
        const node = analyserRef.current;
        if (!node) return;
        node.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));
        if (rms > 0.025) {
          lastSoundRef.current = Date.now();
          setSilentFor(0);
        } else {
          setSilentFor(Math.floor((Date.now() - lastSoundRef.current) / 1000));
        }
      }, 150);
    } catch {
      // le niveau est optionnel
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (statusRef.current === 'paused') return;
      const seconds = Math.floor(
        (Date.now() - startedAtRef.current - pausedTotalRef.current) / 1000,
      );
      elapsedRef.current = seconds;
      setElapsed(seconds);
      if (seconds >= maxSeconds) {
        void finish();
      }
    }, 500);
  }, [finish, maxSeconds]);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen');
      }
    } catch {
      // non supporté
    }
  }, []);

  const pickMimeType = useCallback(() => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
    ];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return '';
  }, []);

  const start = useCallback(async () => {
    if (statusRef.current === 'recording' || statusRef.current === 'starting') return;
    setErrorCode(null);
    setStatus('starting');
    finalizedRef.current = false;
    finishingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType || 'audio/webm';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunkIndexRef.current = 0;
      pendingRef.current = [];
      uploadChainRef.current = Promise.resolve();
      startedAtRef.current = Date.now();
      pausedTotalRef.current = 0;
      elapsedRef.current = 0;
      lastSoundRef.current = Date.now();
      setElapsed(0);
      setChunkCount(0);
      setUploadedCount(0);

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        const index = chunkIndexRef.current;
        chunkIndexRef.current += 1;
        const promise = (async () => {
          try {
            await saveChunkToIdb(recordingId, index, event.data);
          } catch {
            // on continue l'envoi même si IndexedDB échoue
          }
          setChunkCount((count) => Math.max(count, index + 1));
          saveMeta(elapsedRef.current);
          await enqueueUpload(index, event.data);
        })();
        pendingRef.current.push(promise);
      };

      recorder.onerror = () => {
        setErrorCode('RECORDER_ERROR');
        setStatus('error');
      };

      recorder.onstop = async () => {
        releaseResources();
        await Promise.allSettled(pendingRef.current);
        await uploadChainRef.current.catch(() => undefined);
        const total = chunkIndexRef.current;
        if (total === 0) {
          setErrorCode('NO_AUDIO');
          setStatus('error');
          return;
        }
        await finalize(total, elapsedRef.current, mimeTypeRef.current);
      };

      recorder.start(10_000);
      setStatus('recording');
      startTimer();
      startLevelMeter(stream);
      void requestWakeLock();
    } catch (error) {
      releaseResources();
      setErrorCode(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'MIC_DENIED'
          : 'MIC_UNAVAILABLE',
      );
      setStatus('error');
    }
  }, [
    enqueueUpload,
    finalize,
    pickMimeType,
    recordingId,
    releaseResources,
    requestWakeLock,
    saveMeta,
    startLevelMeter,
    startTimer,
  ]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    pauseStartedRef.current = Date.now();
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    pausedTotalRef.current += Date.now() - pauseStartedRef.current;
    recorder.resume();
    setStatus('recording');
  }, []);

  const retryFinalize = useCallback(async () => {
    setErrorCode(null);
    const total = chunkIndexRef.current;
    const duration = elapsedRef.current;
    finalizedRef.current = false;
    await finalize(total, duration, mimeTypeRef.current);
  }, [finalize]);

  const resumeBuffered = useCallback(async () => {
    if (!resumeMeta) return;
    setResuming(true);
    setStatus('uploading');
    try {
      const chunks = await listBufferedChunks(recordingId);
      for (const chunk of chunks) {
        await uploadChunk(chunk.index, chunk.blob);
      }
      await finalize(
        Math.max(resumeMeta.chunkCount, chunks.length),
        resumeMeta.durationSec,
        resumeMeta.mimeType,
      );
    } catch {
      setErrorCode('UPLOAD_FAILED');
      setStatus('error');
    } finally {
      setResuming(false);
    }
  }, [finalize, recordingId, resumeMeta, uploadChunk]);

  // Récupération après coupure réseau / rechargement
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const raw = localStorage.getItem(metaKey);
        if (!raw) return;
        const meta = JSON.parse(raw) as RecorderMeta;
        if (meta.recordingId !== recordingId) return;
        const chunks = await listBufferedChunks(recordingId);
        if (!cancelled && chunks.length > 0) setResumeMeta(meta);
      } catch {
        // ignore
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [metaKey, recordingId]);

  // Démarrage automatique (téléphone appairé)
  useEffect(() => {
    if (autoStart && status === 'idle') {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  useEffect(() => {
    if (status !== 'recording') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [status]);

  useEffect(() => {
    return () => {
      releaseResources();
    };
  }, [releaseResources]);

  const isActive = status === 'recording' || status === 'paused';
  const busy = status === 'starting' || status === 'uploading' || resuming;

  return (
    <div className="rounded-[28px] bg-white p-5 shadow-card ring-1 ring-line/70 sm:p-6">
      {resumeMeta && status === 'idle' ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#FDF3DE] px-4 py-3 text-xs text-[#8A6A18]">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <p className="flex-1">{t('resumeHint', { count: resumeMeta.chunkCount })}</p>
          <Button type="button" size="sm" variant="soft" onClick={() => void resumeBuffered()}>
            {t('resume')}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'grid h-12 w-12 place-items-center rounded-2xl',
              isActive ? 'bg-[#FDECEC] text-danger' : 'bg-primary-50 text-primary-600',
            )}
          >
            <Mic className="h-5 w-5" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-bold">
              {status === 'recording' ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                  {t('recording')}
                </>
              ) : status === 'paused' ? (
                t('paused')
              ) : status === 'uploading' ? (
                t('uploading')
              ) : status === 'finished' ? (
                t('finished')
              ) : (
                t('ready')
              )}
            </p>
            <p className="text-[11px] text-ink-400">
              {t('maxDuration', { minutes: maxMinutes })}
            </p>
          </div>
        </div>

        <div className="text-end">
          <p className="ltr-code text-3xl font-bold tracking-tight">
            {formatCountdown(elapsed)}
          </p>
          <p className="text-[10px] text-ink-400">
            {t('chunks', { sent: uploadedCount, total: chunkCount })}
          </p>
        </div>
      </div>

      <div className="mt-4 flex h-12 items-end justify-center gap-1 rounded-2xl bg-primary-50/60 px-4 py-2">
        {Array.from({ length: 28 }).map((_, index) => {
          const center = 1 - Math.abs(index - 13.5) / 14;
          const height = isActive
            ? Math.max(4, level * 44 * (0.35 + center * 0.9) * (0.6 + Math.random() * 0.6))
            : 4;
          return (
            <span
              key={index}
              className={cn(
                'w-1 rounded-full transition-all duration-100',
                status === 'paused' ? 'bg-ink-300' : 'bg-primary-500',
              )}
              style={{ height }}
            />
          );
        })}
      </div>

      {silentFor >= 15 && status === 'recording' ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#FDF3DE] px-4 py-2.5 text-[11px] font-medium text-[#8A6A18]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t('silenceWarning')}
        </div>
      ) : null}

      {errorCode ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[#FDECEC] px-4 py-3 text-[11px] font-medium text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t(`errors.${errorCode}` as 'errors.MIC_DENIED')}</span>
          {errorCode === 'UPLOAD_FAILED' || errorCode === 'FINALIZE_FAILED' ? (
            <Button type="button" size="sm" variant="soft" onClick={() => void retryFinalize()}>
              {t('retry')}
            </Button>
          ) : null}
          {errorCode.startsWith('MIC_') ? (
            <Button type="button" size="sm" variant="soft" onClick={() => void start()}>
              {t('retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {status === 'idle' || status === 'error' ? (
          <Button
            type="button"
            variant="violet"
            size="lg"
            onClick={() => void start()}
            disabled={busy}
          >
            <Mic className="h-4 w-4" />
            {t('start')}
          </Button>
        ) : null}

        {status === 'starting' ? (
          <Button type="button" variant="soft" size="lg" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('starting')}
          </Button>
        ) : null}

        {status === 'recording' ? (
          <Button type="button" variant="soft" size="lg" onClick={pause}>
            <Pause className="h-4 w-4" />
            {t('pause')}
          </Button>
        ) : null}

        {status === 'paused' ? (
          <Button type="button" variant="soft" size="lg" onClick={resume}>
            <Play className="h-4 w-4" />
            {t('resumeRecording')}
          </Button>
        ) : null}

        {isActive ? (
          <Button type="button" variant="danger" size="lg" onClick={() => void finish()}>
            <Square className="h-4 w-4" />
            {t('finish')}
          </Button>
        ) : null}

        {status === 'uploading' ? (
          <Button type="button" variant="soft" size="lg" disabled>
            <UploadCloud className="h-4 w-4 animate-pulse" />
            {t('uploading')}
          </Button>
        ) : null}

        {status === 'finished' ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-[#E9F6F1] px-4 py-2 text-xs font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" />
            {t('finished')}
          </span>
        ) : null}

        {onCancel && status === 'idle' ? (
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>

      <p className="mt-4 text-center text-[10px] leading-relaxed text-ink-400">
        {t('privacyNote')}
      </p>
    </div>
  );
}
