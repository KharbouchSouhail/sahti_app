import Link from 'next/link';
import { cn } from '@/lib/utils';

export type PillTabItem = { label: string; href: string; active?: boolean };

export function PillTabs({
  items,
  className,
  ariaLabel,
}: {
  items: PillTabItem[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('hide-scrollbar flex items-center gap-2 overflow-x-auto', className)}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          role="tab"
          aria-selected={item.active}
          className={cn(
            'pill shrink-0 px-4 py-2 text-xs',
            item.active
              ? 'bg-primary-600 text-white shadow-soft'
              : 'bg-primary-50 text-ink-500 hover:bg-primary-100 hover:text-primary-700',
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
