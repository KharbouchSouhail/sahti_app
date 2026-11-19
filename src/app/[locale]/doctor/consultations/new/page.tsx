import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { ConsultationForm } from '@/components/doctor/consultation-form';

export const dynamic = 'force-dynamic';

type Props = {
  params: { locale: string };
  searchParams?: { patientId?: string; patientName?: string };
};

export default async function NewConsultationPage({
  params: { locale },
  searchParams,
}: Props) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.form' });
  const patientId = searchParams?.patientId?.trim() ?? '';
  const patientName = searchParams?.patientName?.trim() ?? '';
  const pendingPatient = patientId ? { patientId, patientName } : null;

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('newTitle')} subtitle={t('newSubtitle')} />
      <ConsultationForm pendingPatient={pendingPatient} />
    </div>
  );
}
