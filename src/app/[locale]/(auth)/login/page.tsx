import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('loginTitle') };
}

export default function LoginPage({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  return (
    <div className="w-full max-w-5xl animate-fade-up">
      <Suspense fallback={<div className="h-[560px] w-full animate-pulse rounded-[36px] bg-white/70" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
