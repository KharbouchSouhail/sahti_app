import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  action,
  children,
  className,
  suffix,
}: {
  label: string;
  value: React.ReactNode;
  action?: { label: string; href: string };
  children?: React.ReactNode;
  className?: string;
  suffix?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] bg-[#FDEBE3] p-5 sm:p-6',
        className,
      )}
    >
      <span className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/35" />
      <span className="pointer-events-none absolute -bottom-20 right-16 h-32 w-32 rounded-full bg-accent-200/40" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-600/80">
            {label}
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="stat-number">{value}</span>
            {suffix ? <span className="text-xs font-semibold text-ink-500">{suffix}</span> : null}
          </div>
        </div>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-900 px-4 text-xs font-semibold text-white shadow-pill transition-transform hover:-translate-y-0.5"
          >
            {action.label}
            <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </Link>
        ) : null}
      </div>

      {children ? <div className="relative mt-5">{children}</div> : null}
    </div>
  );
}

export function HighlightCard({
  tone = 'violet',
  title,
  icon,
  children,
  footer,
  className,
}: {
  tone?: 'violet' | 'accent' | 'ink';
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === 'violet'
      ? 'bg-primary-600 text-white'
      : tone === 'accent'
        ? 'bg-accent-500 text-white'
        : 'bg-ink-900 text-white';

  return (
    <div className={cn('relative overflow-hidden rounded-[26px] p-5 shadow-soft sm:p-6', toneClass, className)}>
      <span className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-white/5" />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">{title}</p>
        {icon ? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="relative mt-4">{children}</div>
      {footer ? <div className="relative mt-4 border-t border-white/15 pt-3">{footer}</div> : null}
    </div>
  );
}

export function MiniStatCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'primary' | 'success' | 'accent' | 'sky';
  href?: string;
  className?: string;
}) {
  const toneMap = {
    primary: 'bg-primary-50 text-primary-600',
    success: 'bg-[#E9F6F1] text-success',
    accent: 'bg-accent-100 text-accent-500',
    sky: 'bg-[#E9F1FD] text-[#5B8FCF]',
  };

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-ink-500">{label}</p>
        <span className={cn('grid h-9 w-9 place-items-center rounded-full [&>svg]:h-4 [&>svg]:w-4', toneMap[tone])}>
          {icon}
        </span>
      </div>
      <div className="mt-4 text-2xl font-bold text-ink-900">{value}</div>
      {hint ? <p className="mt-1 truncate text-[11px] text-ink-400">{hint}</p> : null}
    </>
  );

  const classes = cn(
    'rounded-3xl bg-white p-5 ring-1 ring-line/70 transition-all duration-200',
    href && 'hover:-translate-y-0.5 hover:shadow-soft',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }
  return <div className={classes}>{inner}</div>;
}
