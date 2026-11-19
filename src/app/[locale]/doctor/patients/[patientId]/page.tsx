import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { DossierView } from './dossier-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'doctor.dossier' });
  return { title: t('title') };
}

export default async function DossierPatientPage({
  params: { locale, patientId },
}: {
  params: { locale: string; patientId: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.dossier' });

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={t('title')}
        title={t('title')}
        subtitle={t('readOnly')}
      />
      <DossierView patientId={patientId} />
    </div>
  );
}
