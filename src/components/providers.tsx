'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast:
              'rounded-2xl border border-line bg-white shadow-lift text-ink-900 font-sans text-sm',
            title: 'font-semibold',
            description: 'text-ink-500',
            actionButton: 'bg-primary-600 text-white rounded-full',
            cancelButton: 'bg-primary-50 text-ink-500 rounded-full',
          },
        }}
      />
    </QueryClientProvider>
  );
}
