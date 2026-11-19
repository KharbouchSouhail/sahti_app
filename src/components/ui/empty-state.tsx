import * as React from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl bg-primary-50/70 px-6 text-center ring-1 ring-primary-100/60',
        compact ? 'py-8' : 'py-14',
        className,
      )}
    >
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-white text-primary-500 shadow-soft">
        <span className="absolute inset-0 animate-pulse-ring rounded-3xl bg-primary-200/40" />
        <span className="relative [&>svg]:h-7 [&>svg]:w-7">{icon}</span>
      </div>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      {body ? <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
