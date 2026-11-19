import { prisma } from '@/lib/prisma';

export async function createNotification(input: {
  userId: string;
  title: string;
  body: string;
  href?: string | null;
}) {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
      },
    });
  } catch (error) {
    console.error('[notification] failed', error);
  }
}
