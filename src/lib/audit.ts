import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ip?: string;
  meta?: Prisma.InputJsonValue;
};

/** Journalise une action sensible. Ne casse jamais le flux métier. */
export async function logAudit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ip: input.ip,
        meta: input.meta,
      },
    });
  } catch (error) {
    console.error('[audit] failed', error);
  }
}
