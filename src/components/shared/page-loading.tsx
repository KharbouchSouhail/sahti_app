import { Skeleton } from '@/components/ui/spinner';

export function PageLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-fade-in">
      <div className="mb-5 space-y-2.5 px-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-44 rounded-[28px] xl:col-span-5" />
        <Skeleton className="h-44 rounded-[28px] xl:col-span-4" />
        <Skeleton className="h-44 rounded-[28px] xl:col-span-3" />
      </div>

      <div className="mt-6 space-y-2.5">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
