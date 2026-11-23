import { unstable_setRequestLocale } from 'next-intl/server';
import { PhoneRecorder } from '@/components/recorder/phone-recorder';

export const dynamic = 'force-dynamic';

export default async function RecorderSessionPage({
  params: { locale, sessionId },
  searchParams,
}: {
  params: { locale: string; sessionId: string };
  searchParams?: { token?: string };
}) {
  unstable_setRequestLocale(locale);
  const token = typeof searchParams?.token === 'string' ? searchParams.token : '';
  return (
    <main className="min-h-screen px-4 py-8">
      <PhoneRecorder sessionId={sessionId} token={token} locale={locale} />
    </main>
  );
}
