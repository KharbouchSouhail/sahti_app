import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/shared/page-header';
import { NotificationsList } from '@/components/shared/notifications-list';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'notifications' });
  return { title: t('title') };
}

export default async function NotificationsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'notifications' });
  const data = await getSessionUser();
  const user = data!.user;

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <NotificationsList
        initialUnread={unread}
        items={items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          href: item.href,
          readAt: item.readAt ? item.readAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
