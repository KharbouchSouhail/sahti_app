'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { KeyRound, Loader2, Mic, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/client';

export function RecorderPairForm({ locale }: { locale: string }) {
  const t = useTranslations('recorder');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || code.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<
        { paired: false } | { paired: true; sessionId: string; token: string }
      >('/api/recorder-sessions/pair', {
        method: 'POST',
        json: { code: code.trim() },
      });
      if (!result.paired) {
        setError(t('invalidCode'));
        return;
      }
      router.push(
        `/${locale}/recorder/${result.sessionId}?token=${encodeURIComponent(result.token)}`,
      );
    } catch {
      setError(t('pairError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-[30px] bg-white p-6 shadow-card ring-1 ring-line/70 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary-600">
            <Smartphone className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold">{t('pairTitle')}</h1>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">{t('pairSubtitle')}</p>
        </div>

        <form onSubmit={(event) => void submit(event)} className="mt-6">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={t('codePlaceholder')}
            className="ltr-code h-12 text-center text-lg tracking-[0.3em]"
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
          />
          {error ? (
            <p className="mt-2 text-center text-xs font-medium text-danger">{error}</p>
          ) : null}
          <Button
            type="submit"
            variant="violet"
            size="lg"
            className="mt-4 w-full"
            disabled={busy || code.trim().length < 4}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {t('pairAction')}
          </Button>
        </form>

        <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-primary-50/60 p-4 text-[10px] leading-relaxed text-ink-500">
          <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
          <p>{t('privacy')}</p>
        </div>
      </div>
    </div>
  );
}
