'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight, EyeOff, Paperclip, Pill } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type PatientConsultationCardData = {
  id: string;
  href: string;
  consultedAt: string;
  reason: string;
  diagnosis: string | null;
  doctorName: string;
  specialty: string;
  documents: number;
  prescriptions: number;
  hidden?: boolean;
};

export function ConsultationCard({
  data,
  compact,
  className,
}: {
  data: PatientConsultationCardData;
  compact?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('patient.consultations');

  return (
    <Link
      href={data.href}
      className={cn(
        'group flex items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-line/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft',
        data.hidden && 'opacity-70',
        className,
      )}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100/60">
        <span className="text-lg font-bold leading-none">
          {formatDate(data.consultedAt, locale, { day: '2-digit' })}
        </span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-ink-400">
          {formatDate(data.consultedAt, locale, { month: 'short' })}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-ink-900 sm:text-[15px]">{data.reason}</h3>
          {data.hidden ? (
            <Badge variant="gray" size="sm" className="shrink-0 gap-1">
              <EyeOff className="h-3 w-3" />
              {t('hidden')}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-ink-500">
          {data.doctorName} <span className="text-ink-300">·</span> {data.specialty}
        </p>
        {!compact && data.diagnosis ? (
          <p className="mt-1.5 line-clamp-1 text-xs text-ink-400">{data.diagnosis}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {data.documents > 0 ? (
          <span className="hidden items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-semibold text-ink-500 sm:inline-flex">
            <Paperclip className="h-3 w-3" />
            {data.documents}
          </span>
        ) : null}
        {!compact && data.prescriptions > 0 ? (
          <span className="hidden items-center gap-1 rounded-full bg-[#E9F6F1] px-2.5 py-1 text-[10px] font-semibold text-success sm:inline-flex">
            <Pill className="h-3 w-3" />
            {data.prescriptions}
          </span>
        ) : null}
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white">
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </span>
      </div>
    </Link>
  );
}
