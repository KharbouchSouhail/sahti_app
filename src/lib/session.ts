import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const getSessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { patient: true, doctor: true },
  });
  // Session périmée (utilisateur supprimé, base réinitialisée…) : jamais de crash,
  // on renvoie vers la connexion plutôt qu'une boucle de redirections.
  if (!user) redirect('/login');

  const unread = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  return { user, unread };
});
