'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ConsultationStatusValue =
  | 'DRAFT'
  | 'RECORDING'
  | 'PROCESSING'
  | 'AI_REVIEW'
  | 'COMPLETED'
  | 'LINKED';

const MAP = {
  DRAFT: { variant: 'gray' as const, dot: 'bg-ink-300' },
  RECORDING: { variant: 'red' as const, dot: 'bg-danger animate-pulse' },
  PROCESSING: { variant: 'violet' as const, dot: 'bg-primary-500 animate-pulse' },
  AI_REVIEW: { variant: 'yellow' as const, dot: 'bg-[#C2912A]' },
  COMPLETED: { variant: 'peach' as const, dot: 'bg-warning' },
  LINKED: { variant: 'green' as const, dot: 'bg-success' },
};

export function StatusBadge({
  status,
  className,
  withDot = true,
}: {
  status: ConsultationStatusValue;
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
