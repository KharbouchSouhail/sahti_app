'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Info, LockKeyhole, Mic, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConsentValues = {
  audio: boolean;
  aiProcessing: boolean;
  retention: boolean;
};

export function ConsentGate({
  onStart,
  onRefuse,
  busy,
  error,
  patientName,
}: {
  onStart: (values: ConsentValues) => void;
  onRefuse: () => void;
  busy?: boolean;
  error?: string | null;
  patientName?: string | null;
}) {
  const t = useTranslations('doctor.ai.consent');
  const [values, setValues] = useState<ConsentValues>({
    audio: false,
    aiProcessing: false,
    retention: false,
  });

  const canStart = values.audio && values.aiProcessing && !busy;

  const rows = [
    {
      key: 'audio' as const,
      icon: <Mic className="h-4 w-4" />,
      title: t('audioTitle'),
      body: t('audioBody'),
      required: true,
    },
    {
      key: 'aiProcessing' as const,
      icon: <Sparkles className="h-4 w-4" />,
      title: t('aiTitle'),
      body: t('aiBody'),
      required: true,
    },
    {
      key: 'retention' as const,
      icon: <LockKeyhole className="h-4 w-4" />,
      title: t('retentionTitle'),
      body: t('retentionBody'),
      required: false,
    },
  ];

  return (
    <div className="rounded-[30px] bg-white p-5 shadow-card ring-1 ring-line/70 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 className="mt-1 text-xl font-bold">{t('title')}</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-500">{t('subtitle')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-[10px] font-semibold text-primary-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('badge')}
        </span>
      </div>

      {patientName ? (
        <div className="mt-4 rounded-2xl bg-primary-50/70 px-4 py-2.5 text-[11px] font-semibold text-primary-700">
          {t('patientLinked', { name: patientName })}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {rows.map((row) => {
          const checked = values[row.key];
          return (
            <label
              key={row.key}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors',
                checked
                  ? 'border-primary-300 bg-primary-50/70'
                  : 'border-line bg-white hover:border-primary-200 hover:bg-primary-50/30',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#6F63B5]"
                checked={checked}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, [row.key]: event.target.checked }))
                }
              />
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-sm">
                {row.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                  {row.title}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[9px] font-semibold',
                      row.required
                        ? 'bg-[#FDECEC] text-danger'
                        : 'bg-primary-100 text-primary-700',
                    )}
                  >
                    {row.required ? t('required') : t('optional')}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500">
                  {row.body}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#F6F4FC] p-4 text-[11px] leading-relaxed text-ink-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
        <p>{t('notice')}</p>
      </div>

      {error ? (
        <div className="mt-3 rounded-2xl bg-[#FDECEC] px-4 py-3 text-xs font-medium text-danger">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onRefuse}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-semibold text-ink-500 transition-colors hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
        >
          <FileText className="h-3.5 w-3.5" />
          {t('refuse')}
        </button>
        <Button
          type="button"
          variant="violet"
          size="lg"
          disabled={!canStart}
          onClick={() => onStart(values)}
        >
          <Mic className="h-4 w-4" />
          {busy ? t('starting') : t('start')}
        </Button>
      </div>
      {!values.audio || !values.aiProcessing ? (
        <p className="mt-2 text-center text-[10px] text-ink-400">{t('requiredHint')}</p>
      ) : null}
    </div>
  );
}
