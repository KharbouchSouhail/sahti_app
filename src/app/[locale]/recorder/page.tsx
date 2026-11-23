import { unstable_setRequestLocale } from 'next-intl/server';
import { RecorderPairForm } from '@/components/recorder/pair-form';

export const dynamic = 'force-dynamic';

export default async function RecorderPairPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  return (
    <main className="min-h-screen px-4 py-10">
      <RecorderPairForm locale={locale} />
    </main>
  );
}
