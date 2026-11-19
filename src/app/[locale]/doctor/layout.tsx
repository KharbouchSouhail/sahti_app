import { redirect } from 'next/navigation';
import { unstable_setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { AppShell } from '@/components/shared/app-shell';

export default async function DoctorLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const data = await getSessionUser();
  if (!data) redirect(`/${locale}/login`);
  if (data.user.role !== 'DOCTOR') redirect(`/${locale}/patient`);

  return (
    <AppShell
      user={{
        fullName: data.user.fullName,
        email: data.user.email,
        role: data.user.role,
        specialty: data.user.doctor?.specialty,
        avatarUrl: data.user.avatarUrl,
      }}
      unreadCount={data.unread}
    >
      {children}
    </AppShell>
  );
}
