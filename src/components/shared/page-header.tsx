import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={`mb-5 flex flex-wrap items-end justify-between gap-4 px-1 ${className ?? ''}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5 text-primary-500">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
