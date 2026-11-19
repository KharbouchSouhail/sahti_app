'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MAP = {
  DRAFT: { variant: 'gray' as const, dot: 'bg-ink-300' },
  COMPLETED: { variant: 'peach' as const, dot: 'bg-warning' },
  LINKED: { variant: 'green' as const, dot: 'bg-success' },
};

export function StatusBadge({
  status,
  className,
  withDot = true,
}: {
  status: 'DRAFT' | 'COMPLETED' | 'LINKED';
  className?: string;
  withDot?: boolean;
}) {
  const t = useTranslations('status');
  const meta = MAP[status];
  return (
    <Badge variant={meta.variant} className={cn('gap-1.5', className)}>
      {withDot && <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />}
      {t(status)}
    </Badge>
  );
}
