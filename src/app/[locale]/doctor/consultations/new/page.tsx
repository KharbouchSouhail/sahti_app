import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { ArrowRight, Check, FileText, Mic, ShieldCheck, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

export const dynamic = 'force-dynamic';

type Props = {
  params: { locale: string };
  searchParams?: { patientId?: string; patientName?: string };
};

export default async function NewConsultationPage({ params: { locale }, searchParams }: Props) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.form' });
  const tm = await getTranslations({ locale, namespace: 'doctor.ai.mode' });

  const query = new URLSearchParams();
  if (searchParams?.patientId) query.set('patientId', searchParams.patientId);
  if (searchParams?.patientName) query.set('patientName', searchParams.patientName);
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('newTitle')} subtitle={t('newSubtitle')} />

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/${locale}/doctor/consultations/new/manual${suffix}`}
          className="group relative overflow-hidden rounded-[30px] bg-white p-6 shadow-card ring-1 ring-line/70 transition-all hover:-translate-y-0.5 hover:shadow-soft"
        >
          <span className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-primary-50" />
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary-100 text-primary-700">
            <FileText className="h-5 w-5" />
          </span>
          <h2 className="relative mt-4 text-lg font-bold">{tm('manualTitle')}</h2>
          <p className="relative mt-1 text-xs leading-relaxed text-ink-500">
            {tm('manualBody')}
          </p>
          <ul className="relative mt-4 space-y-1.5 text-[11px] text-ink-500">
            {[tm('manualPoint1'), tm('manualPoint2'), tm('manualPoint3')].map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                {point}
              </li>
            ))}
          </ul>
          <span className="relative mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-primary-700">
            {tm('manualAction')}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </span>
        </Link>

        <Link
          href={`/${locale}/doctor/consultations/new/ai${suffix}`}
          className="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white shadow-soft transition-all hover:-translate-y-0.5"
        >
          <span className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/10" />
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
            <Mic className="h-5 w-5" />
          </span>
          <h2 className="relative mt-4 flex flex-wrap items-center gap-2 text-lg font-bold">
            {tm('aiTitle')}
            <span className="rounded-full bg-[#8CE0C1]/20 px-2 py-0.5 text-[9px] font-semibold text-[#8CE0C1]">
              <Sparkles className="me-0.5 inline h-2.5 w-2.5" />
              {tm('aiBadge')}
            </span>
          </h2>
          <p className="relative mt-1 text-xs leading-relaxed text-white/75">{tm('aiBody')}</p>
          <ul className="relative mt-4 space-y-1.5 text-[11px] text-white/75">
            {[tm('aiPoint1'), tm('aiPoint2'), tm('aiPoint3')].map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-[#8CE0C1]" />
                {point}
              </li>
            ))}
          </ul>
          <span className="relative mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-white">
            {tm('aiAction')}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </span>
        </Link>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-white/70 p-4 text-[11px] leading-relaxed text-ink-500 ring-1 ring-line/60">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p>{tm('privacy')}</p>
      </div>
    </div>
  );
}
