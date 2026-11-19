import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-ink-400">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-50">
          <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
        </div>
        <span className="text-xs font-medium">…</span>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-primary-100/60', className)} />;
}
