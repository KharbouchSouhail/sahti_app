import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { QrPanel } from './qr-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'patient.qr' });
  return { title: t('title') };
}

export default async function PatientQrPage({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'patient.qr' });

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <QrPanel />
    </div>
  );
}
