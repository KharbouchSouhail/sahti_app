'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/shared/logo';
import { useTranslations } from 'next-intl';

export function QRDisplay({
  value,
  code,
  size = 216,
  withLogo = true,
  className,
  showCode = true,
  hint,
}: {
  value: string;
  code?: string;
  size?: number;
  withLogo?: boolean;
  className?: string;
  showCode?: boolean;
  hint?: string;
}) {
  const t = useTranslations('patient.qr');
  const tc = useTranslations('common');
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.replace(/-/g, ''));
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error(tc('networkError'));
    }
  }

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative rounded-[30px] bg-white p-5 shadow-[0_18px_50px_rgba(17,17,17,0.18)]">
        {/* coins décoratifs */}
        <span className="absolute -left-1.5 -top-1.5 h-5 w-5 rounded-tl-2xl border-l-2 border-t-2 border-accent-400" />
        <span className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-tr-2xl border-r-2 border-t-2 border-accent-400" />
        <span className="absolute -bottom-1.5 -left-1.5 h-5 w-5 rounded-bl-2xl border-b-2 border-l-2 border-accent-400" />
        <span className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-br-2xl border-b-2 border-r-2 border-accent-400" />

        <div className="relative" style={{ width: size, height: size }}>
          <QRCodeSVG
            value={value}
            size={size}
            level="H"
            bgColor="#FFFFFF"
            fgColor="#14131C"
            marginSize={0}
            className="h-full w-full"
          />
          {withLogo && (
            <div className="absolute left-1/2 top-1/2 grid h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border-[5px] border-white bg-white shadow-sm">
              <LogoMark className="h-[42px] w-[42px] rounded-xl shadow-none" />
            </div>
          )}
        </div>
      </div>

      {showCode && code ? (
        <div className="mt-5 flex flex-col items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            {t('codeLabel')}
          </span>
          <div className="flex items-center gap-2">
            <span className="ltr-code rounded-2xl bg-white/15 px-4 py-2.5 text-2xl font-bold tracking-[0.18em] text-white">
              {code}
            </span>
            <button
              type="button"
              onClick={copy}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-white transition-colors hover:bg-white/25"
              aria-label={t('copyCode')}
            >
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
        </div>
      ) : null}

      {hint ? (
        <p className="mt-4 flex items-center gap-2 text-center text-xs text-white/65">
          <ShieldCheck className="h-3.5 w-3.5" />
          {hint}
        </p>
      ) : null}
    </div>
  );
}
