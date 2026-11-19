'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Check,
  Eye,
  FileDown,
  Link2,
  Loader2,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/client';
import { formatDateTime } from '@/lib/utils';

type Grant = {
  id: string;
  scope: 'VITALS' | 'FULL';
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessAt: string | null;
  accessCount: number;
  active: boolean;
  doctor: { fullName: string; specialty: string };
};

type LogEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
  specialty: string | null;
  section: string | null;
  scope: string | null;
};

const GRANTS_URL = '/api/patient/access-grants';
const LOG_URL = '/api/patient/access-log';

export function AccessView() {
  const t = useTranslations('patient.access');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [target, setTarget] = useState<Grant | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, l] = await Promise.all([
        apiFetch<{ items: Grant[] }>(GRANTS_URL),
        apiFetch<{ items: LogEntry[] }>(LOG_URL),
      ]);
      setGrants(g.items);
      setLog(l.items);
    } catch {
      setGrants([]);
      setLog([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = grants?.filter((g) => g.active) ?? [];
  const history = log ?? [];

  async function confirmRevoke() {
    if (!target) return;
    setRevoking(true);
    try {
      await apiFetch(`${GRANTS_URL}/${target.id}/revoke`, { method: 'POST' });
      toast.success(t('revokeSuccess', { doctor: target.doctor.fullName }));
      setTarget(null);
      await load();
    } catch {
      toast.error(tc('error'));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
            {t('activeSection')}
          </h2>
          {grants !== null && (
            <Badge variant="violet">{active.length}</Badge>
          )}
        </div>

        {grants === null ? (
          <div className="grid h-28 place-items-center rounded-3xl bg-white ring-1 ring-line/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-line/70">
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6 text-primary-500" />}
              title={t('emptyActiveTitle')}
              body={t('emptyActiveBody')}
              action={
                <Link
                  href={`/${locale}/patient/qr`}
                  className="btn inline-flex items-center gap-2 bg-ink-900 px-5 py-2.5 text-xs font-bold text-white"
                >
                  {t('shareNow')}
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((grant) => (
              <div
                key={grant.id}
                className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={grant.doctor.fullName} tone="violet" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{grant.doctor.fullName}</p>
                    <p className="truncate text-[11px] text-ink-400">{grant.doctor.specialty}</p>
                  </div>
                  <Badge variant={grant.scope === 'FULL' ? 'peach' : 'violet'}>
                    {grant.scope === 'FULL' ? t('scopeFull') : t('scopeVitals')}
                  </Badge>
                </div>

                <div className="mt-4 space-y-1.5 text-[11px] text-ink-500">
                  <p>{t('expiresAt', { date: formatDateTime(grant.expiresAt, locale) })}</p>
                  {grant.lastAccessAt ? (
                    <p>{t('lastAccess', { date: formatDateTime(grant.lastAccessAt, locale) })}</p>
                  ) : null}
                  <p>{t('accessCount', { count: grant.accessCount })}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setTarget(grant)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-[#d94f56]"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  {t('revoke')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
          {t('historySection')}
        </h2>

        {log === null ? (
          <div className="grid h-24 place-items-center rounded-3xl bg-white ring-1 ring-line/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-3xl bg-white ring-1 ring-line/70">
            <EmptyState
              icon={<ShieldQuestion className="h-6 w-6 text-ink-300" />}
              title={t('emptyHistoryTitle')}
              body={t('emptyHistoryBody')}
            />
          </div>
        ) : (
          <ol className="relative space-y-0 rounded-3xl bg-white p-5 ring-1 ring-line/70">
            <span
              aria-hidden="true"
              className="absolute bottom-6 start-[2.05rem] top-6 w-px bg-line"
            />
            {history.map((entry) => {
              const view = viewFor(entry, t);
              return (
                <li key={entry.id} className="relative flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                    {view.icon}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-xs font-semibold leading-snug text-ink-900">
                      <span className="font-bold">{entry.actorName ?? '—'}</span> {view.text}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-ink-400">
                      {formatDateTime(entry.createdAt, locale)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('revokeConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {target ? t('revokeConfirmBody', { doctor: target.doctor.fullName }) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className="btn-outline" onClick={() => setTarget(null)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={confirmRevoke}
              disabled={revoking}
              className="btn bg-danger text-white hover:bg-[#d94f56]"
            >
              {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              {t('revokeConfirmAction')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function viewFor(entry: LogEntry, t: (key: string, values?: Record<string, string | number>) => string) {
  const sectionLabel =
    entry.section === 'summary'
      ? t('sectionVitals')
      : entry.section === 'history'
        ? t('sectionHistory')
        : entry.section === 'consultation'
          ? t('sectionConsultation')
          : '';
  const scopeLabel = entry.scope === 'FULL' ? t('scopeFull') : t('scopeVitals');

  switch (entry.action) {
    case 'ACCESS_GRANTED':
      return { icon: <ShieldCheck className="h-4 w-4" />, text: t('logGranted', { scope: scopeLabel }) };
    case 'PATIENT_FILE_VIEWED':
      return { icon: <Eye className="h-4 w-4" />, text: t('logViewed', { section: sectionLabel }) };
    case 'FILE_DOWNLOADED':
      return { icon: <FileDown className="h-4 w-4" />, text: t('logDownloaded') };
    case 'ACCESS_REVOKED':
      return { icon: <ShieldOff className="h-4 w-4" />, text: t('logRevoked') };
    case 'LINK_VIA_GRANT':
      return { icon: <Link2 className="h-4 w-4" />, text: t('logLinked') };
    default:
      return { icon: <Check className="h-4 w-4" />, text: entry.action };
  }
}
