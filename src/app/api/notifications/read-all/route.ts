import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function PATCH() {
  return handle(async () => {
    const session = await requireUser();
    const result = await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  });
}
