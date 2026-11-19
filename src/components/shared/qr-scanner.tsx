'use client';

import dynamic from 'next/dynamic';
import { Camera, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const Scanner = dynamic(() => import('@yudiel/react-qr-scanner').then((mod) => mod.Scanner), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-ink-900 text-white/60">
      <Camera className="h-7 w-7 animate-pulse" />
    </div>
  ),
});

export function QRScanner({
  onResult,
  paused,
  className,
  hint,
}: {
  onResult: (raw: string) => void;
  paused?: boolean;
  className?: string;
  hint?: string;
}) {
  const t = useTranslations('common');
  const [error, setError] = useState(false);

  function handleScan(codes: unknown) {
    if (!codes) return;
    let raw = '';
    if (Array.isArray(codes)) {
      const first = codes[0] as { rawValue?: string } | string | undefined;
      raw = typeof first === 'string' ? first : (first?.rawValue ?? '');
    } else if (typeof codes === 'string') {
      raw = codes;
    } else if (typeof codes === 'object' && 'rawValue' in (codes as object)) {
      raw = String((codes as { rawValue?: string }).rawValue ?? '');
    }
    if (raw) onResult(raw);
  }

  return (
    <div className={cn('relative overflow-hidden rounded-3xl bg-ink-900', className)}>
      <div className="aspect-square w-full">
        {error ? (
          <div className="grid h-full w-full place-items-center px-8 text-center">
            <div>
              <Camera className="mx-auto mb-3 h-8 w-8 text-white/60" />
              <p className="text-sm font-medium text-white">{t('scanHint')}</p>
            </div>
          </div>
        ) : (
          <Scanner
            onScan={handleScan}
            onError={() => setError(true)}
            paused={paused}
            scanDelay={450}
            constraints={{ facingMode: 'environment' }}
          />
        )}
      </div>

      {/* cadre de visée */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-[62%] w-[62%] max-h-[260px] max-w-[260px]">
          <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-2xl border-l-4 border-t-4 border-white" />
          <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-2xl border-r-4 border-t-4 border-white" />
          <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-2xl border-b-4 border-l-4 border-white" />
          <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-2xl border-b-4 border-r-4 border-white" />
          <span className="absolute left-1/2 top-1/2 h-1 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-400/80 shadow-[0_0_18px_rgba(247,146,107,0.9)]" />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-ink-900/80 to-transparent px-4 pb-4 pt-10 text-center text-xs font-medium text-white">
        <ScanLine className="h-4 w-4 text-accent-300" />
        {hint ?? t('scanHint')}
      </div>
    </div>
  );
}
