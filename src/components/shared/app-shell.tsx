'use client';

import type { Role } from '@prisma/client';
import { useLocale } from 'next-intl';
import { BottomNav } from '@/components/shared/bottom-nav';
import { Sidebar, type ShellUser } from '@/components/shared/sidebar';
import { Topbar } from '@/components/shared/topbar';

export function AppShell({
  user,
  unreadCount,
  children,
}: {
  user: ShellUser;
  unreadCount: number;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const role = user.role as Role;

  return (
    <div className="min-h-screen p-2.5 sm:p-4 lg:p-5">
      <div className="app-shell min-h-[calc(100vh-1.25rem)] flex-row gap-4 p-2.5 sm:p-3 lg:min-h-[calc(100vh-2.5rem)] lg:p-4">
        <Sidebar user={user} locale={locale} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} role={role} unreadCount={unreadCount} />
          <main className="flex-1 px-0.5 pb-28 pt-2 sm:px-1 lg:pb-2">{children}</main>
        </div>
      </div>
      <BottomNav role={role} />
    </div>
  );
}
