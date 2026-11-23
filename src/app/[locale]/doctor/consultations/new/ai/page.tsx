import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { AiConsultationFlow } from '@/components/doctor/ai/ai-consultation-flow';

export const dynamic = 'force-dynamic';

type Props = {
  params: { locale: string };
  searchParams?: { patientId?: string; patientName?: string };
};

export default async function NewAiConsultationPage({ params: { locale }, searchParams }: Props) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.ai.flow' });
  const patientId = searchParams?.patientId?.trim() ?? '';
  const patientName = searchParams?.patientName?.trim() ?? '';
  const pendingPatient = patientId ? { patientId, patientName } : null;

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <AiConsultationFlow locale={locale} pendingPatient={pendingPatient} />
    </div>
  );
}
