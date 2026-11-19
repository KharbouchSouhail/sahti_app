'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function SearchPill({
  placeholder,
  action,
  defaultValue = '',
  className,
  name = 'query',
}: {
  placeholder: string;
  action: string;
  defaultValue?: string;
  className?: string;
  name?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  return (
    <form
      className={cn(
        'group flex h-11 w-full items-center gap-2 rounded-full bg-primary-50 px-2 ps-4 ring-1 ring-primary-100/70 transition-all focus-within:bg-white focus-within:ring-primary-300',
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        if (value.trim()) params.set(name, value.trim());
        router.push(params.size ? `${action}?${params.toString()}` : action);
      }}
    >
      <Search className="h-4 w-4 shrink-0 text-ink-400 transition-colors group-focus-within:text-primary-500" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
      />
      <button
        type="submit"
        className="hidden h-8 rounded-full bg-white px-3 text-[11px] font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-100 sm:block"
      >
        ↵
      </button>
    </form>
  );
}
