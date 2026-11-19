'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/client';
import { cn, formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsList({
  items: initialItems,
  initialUnread,
}: {
  items: NotificationItem[];
  initialUnread: number;
}) {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, setPending] = useState(false);

  async function markAll() {
    setPending(true);
    setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnread(0);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      router.refresh();
    } catch {
      toast.error(tc('networkError'));
    } finally {
      setPending(false);
    }
  }

  async function open(item: NotificationItem) {
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
      setUnread((prev) => Math.max(0, prev - 1));
      try {
        await apiFetch(`/api/notifications/${item.id}/read`, { method: 'PATCH' });
      } catch {
        // la navigation reste possible
      }
    }
    if (item.href) {
      router.push(item.href.startsWith('/') ? `/${locale}${item.href}` : item.href);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-100 text-primary-600">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-900">{t('title')}</p>
            <p className="text-[10px] text-ink-400">
              {unread > 0 ? `${unread} ${t('new')}` : tc('all')}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={markAll}
          disabled={pending || unread === 0}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          {t('markAll')}
        </Button>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => open(item)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl p-3.5 text-start transition-colors',
                item.readAt
                  ? 'bg-white ring-1 ring-line/60 hover:bg-primary-50/50'
                  : 'bg-primary-50/80 ring-1 ring-primary-100/60 hover:bg-primary-100/70',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                  item.readAt ? 'bg-primary-50 text-primary-400' : 'bg-primary-600 text-white',
                )}
              >
                {item.readAt ? <Check className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-ink-900">{item.title}</span>
                  {!item.readAt ? (
                    <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[9px] font-bold text-accent-600">
                      {t('new')}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-ink-500">{item.body}</span>
                <span className="mt-1.5 block text-[10px] text-ink-300">
                  {formatDate(item.createdAt, locale, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <EmptyState icon={<Inbox />} title={t('empty')} body={t('emptyBody')} compact />
        </div>
      )}
    </div>
  );
}
