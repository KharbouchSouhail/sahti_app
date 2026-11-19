import { handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser();
    const result = await prisma.notification.updateMany({
      where: { id: params.id, userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  });
}
