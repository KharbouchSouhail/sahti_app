import { z } from 'zod';
import { AccessScope } from '@prisma/client';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import {
  assertLinkTokenUsable,
  consumeLinkToken,
  resolveLinkToken,
  upsertGrant,
} from '@/lib/access';
import { clearRateLimit, isRateLimited, rateLimitKey, registerFailure } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { formatTime } from '@/lib/utils';

export const runtime = 'nodejs';

const schema = z.object({ tokenOrCode: z.string().min(1).max(300) });

/**
 * Ouvre l'accès au dossier du patient associé au jeton QR (portée VITALS ou FULL).
 * Un QR de portée LINK_ONLY est refusé.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const key = rateLimitKey(session.user.id, 'link');
    if (isRateLimited(key).limited) throw new ApiError('RATE_LIMITED', 429);

    const body = await parseJson(request, schema);
    const token = await resolveLinkToken(body.tokenOrCode);

    if (!token) {
      registerFailure(key);
      await logAudit({
        userId: session.user.id,
        action: 'ACCESS_FAILED',
        entityType: 'PatientLinkToken',
        meta: { reason: 'INVALID' },
      });
      throw new ApiError('LINK_INVALID', 404);
    }

    if (token.scope === AccessScope.LINK_ONLY) {
      // Le patient n'a pas autorisé l'accès à son dossier.
      registerFailure(key);
      await logAudit({
        userId: session.user.id,
        action: 'ACCESS_FAILED',
        entityType: 'PatientLinkToken',
        entityId: token.id,
        meta: { reason: 'SCOPE_LINK_ONLY' },
      });
      throw new ApiError('GRANT_SCOPE_REQUIRED', 403);
    }

    try {
      assertLinkTokenUsable(token);
    } catch (error) {
      registerFailure(key);
      if (error instanceof ApiError && error.code === 'LINK_EXPIRED') {
        await logAudit({
          userId: session.user.id,
          action: 'ACCESS_EXPIRED_ATTEMPT',
          entityType: 'PatientLinkToken',
          entityId: token.id,
        });
      }
      throw error;
    }

    const grant = await prisma.$transaction(async (tx) => {
      const created = await upsertGrant(tx, {
        patientId: token.patientId,
        doctorId: doctor.id,
        scope: token.scope,
        durationMin: token.durationMin,
      });
      await consumeLinkToken(tx, token);
      return created;
    });

    const doctorUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { fullName: true },
    });
    const doctorName = doctorUser?.fullName ?? doctor.specialty;
    const isAr = token.patient.user.locale === 'ar';
    const scopeLabelAr = token.scope === AccessScope.FULL ? 'كامل' : 'حيوي';
    const scopeLabelFr = token.scope === AccessScope.FULL ? 'complet' : 'vital';

    await createNotification({
      userId: token.patient.user.id,
      title: isAr ? 'تم فتح الوصول إلى ملفك' : 'Accès à votre dossier ouvert',
      body: isAr
        ? `${doctorName} يملك صلاحية ${scopeLabelAr} على ملفك حتى الساعة ${formatTime(grant.expiresAt, 'ar')}.`
        : `${doctorName} a accès ${scopeLabelFr} à votre dossier jusqu'à ${formatTime(grant.expiresAt, 'fr')}.`,
      href: '/patient/access',
    });

    await logAudit({
      userId: session.user.id,
      action: 'ACCESS_GRANTED',
      entityType: 'AccessGrant',
      entityId: grant.id,
      meta: {
        patientId: token.patientId,
        scope: grant.scope,
        expiresAt: grant.expiresAt,
        durationMin: token.durationMin,
      },
    });

    clearRateLimit(key);
    return {
      patientId: token.patientId,
      scope: grant.scope,
      expiresAt: grant.expiresAt,
      patientName: token.patient.user.fullName,
    };
  });
}
