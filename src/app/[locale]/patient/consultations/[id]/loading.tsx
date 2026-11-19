import { Skeleton } from '@/components/ui/spinner';

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-40 w-full rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-72 rounded-3xl lg:col-span-8" />
        <Skeleton className="h-72 rounded-3xl lg:col-span-4" />
      </div>
    </div>
  );
}
