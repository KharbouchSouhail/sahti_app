'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Check,
  Clock3,
  FolderOpen,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { QRScanner } from '@/components/shared/qr-scanner';
import { CodeInput } from '@/components/ui/code-input';
import { apiFetch, errorCode } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

type GrantItem = {
  grantId: string;
  patientId: string;
  patientName: string;
  scope: 'VITALS' | 'FULL';
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessAt: string | null;
  accessCount: number;
  active: boolean;
};

export function PatientsView() {
  const t = useTranslations('doctor.patients');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();

  const [items, setItems] = useState<GrantItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'scan' | 'code'>('scan');
  const [code, setCode] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ items: GrantItem[] }>('/api/doctor/patients');
      setItems(result.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function redeem(raw: string) {
    const value = raw.trim();
    if (!value || opening) return;
    setOpening(true);
    setError(null);
    try {
      const result = await apiFetch<{ patientId: string }>('/api/doctor/access/redeem', {
        method: 'POST',
        json: { tokenOrCode: value },
      });
      setOpen(false);
      toast.success(t('viewDossier'));
      router.push(`/${locale}/doctor/patients/${result.patientId}`);
    } catch (err) {
      const codeError = errorCode(err);
      setError(
        codeError === 'GRANT_SCOPE_REQUIRED'
          ? te('GRANT_SCOPE_REQUIRED')
          : codeError === 'LINK_EXPIRED'
            ? te('LINK_EXPIRED')
            : codeError === 'LINK_USED'
              ? te('LINK_USED')
              : codeError === 'RATE_LIMITED'
                ? te('RATE_LIMITED')
                : t('openError'),
      );
    } finally {
      setOpening(false);
    }
  }

  const active = items?.filter((i) => i.active) ?? [];
  const expired = items?.filter((i) => !i.active) ?? [];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
            setCode('');
          }}
          className="btn inline-flex items-center gap-2 bg-ink-900 px-5 py-3 text-xs font-bold text-white shadow-pill hover:bg-ink-700"
        >
          <FolderOpen className="h-4 w-4" />
          {t('open')}
        </button>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
            {t('activeSection')}
          </h2>
          {items !== null ? (
            <Badge variant="violet">{active.length}</Badge>
          ) : null}
        </div>
        {items === null ? (
          <div className="grid h-28 place-items-center rounded-3xl bg-white ring-1 ring-line/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-line/70">
            <EmptyState
              icon={<Users className="h-6 w-6 text-primary-500" />}
              title={t('emptyTitle')}
              body={t('emptyBody')}
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((grant) => (
              <button
                key={grant.grantId}
                type="button"
                onClick={() => router.push(`/${locale}/doctor/patients/${grant.patientId}`)}
                className="group rounded-3xl bg-white p-5 text-start shadow-card ring-1 ring-line/70 transition-all hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={grant.patientName} tone="violet" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900 group-hover:text-primary-700">
                      {grant.patientName}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[10px] tabular-nums text-ink-400">
                      <Clock3 className="h-3 w-3" />
                      {t('expiresAt', { date: formatDateTime(grant.expiresAt, locale) })}
                    </p>
                  </div>
                  <Badge variant={grant.scope === 'FULL' ? 'peach' : 'violet'}>
                    {grant.scope === 'FULL' ? t('scopeFull') : t('scopeVitals')}
                  </Badge>
                </div>
                <p className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-primary-600">
                  {t('viewDossier')}
                  <Check className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {expired.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
              {t('recentSection')}
            </h2>
            <Badge variant="gray">{expired.length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {expired.map((grant) => (
              <div
                key={grant.grantId}
                className="rounded-3xl bg-ink-50/60 p-5 ring-1 ring-line/70 opacity-75"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={grant.patientName} tone="soft" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-500">{grant.patientName}</p>
                    <p className="mt-1 text-[10px] text-ink-400">
                      {t('expiresAt', { date: formatDateTime(grant.expiresAt, locale) })}
                    </p>
                  </div>
                  <Badge variant="gray">{t('expiredLabel')}</Badge>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-ink-400">{t('reapplyHint')}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('open')}</DialogTitle>
            <DialogDescription>{t('subtitle')}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-1 rounded-full bg-primary-50 p-1">
            <button
              type="button"
              onClick={() => setTab('scan')}
              className={
                tab === 'scan'
                  ? 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-semibold text-primary-700 shadow-sm'
                  : 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-ink-500'
              }
            >
              <Camera className="h-3.5 w-3.5" />
              {t('scanTab')}
            </button>
            <button
              type="button"
              onClick={() => setTab('code')}
              className={
                tab === 'code'
                  ? 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-semibold text-primary-700 shadow-sm'
                  : 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-ink-500'
              }
            >
              <KeyRound className="h-3.5 w-3.5" />
              {t('codeTab')}
            </button>
          </div>

          {tab === 'scan' ? (
            <div className="mt-4">
              <QRScanner
                onResult={(raw) => void redeem(raw)}
                paused={opening}
                hint={t('scanInstruction')}
                className="mx-auto w-full"
              />
              <p className="mt-3 rounded-2xl bg-primary-50/70 px-4 py-3 text-center text-[11px] leading-relaxed text-ink-500">
                {t('scanInstruction')}
              </p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center">
              <CodeInput value={code} onChange={setCode} onComplete={(value) => void redeem(value)} disabled={opening} autoFocus className="mt-1" />
              <button
                type="button"
                onClick={() => void redeem(code)}
                disabled={opening || code.length < 8}
                className="btn mt-5 w-full justify-center bg-primary-600 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {t('openCta')}
              </button>
              <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-400">{t('codeInstruction')}</p>
            </div>
          )}

          {opening && tab === 'scan' ? (
            <p className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-primary-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('opening')}
            </p>
          ) : null}

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#FDECEC] px-4 py-3 text-[11px] font-medium text-danger">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
