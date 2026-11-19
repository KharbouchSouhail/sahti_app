import { z } from 'zod';
import { AccessScope, LinkMethod } from '@prisma/client';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import {
  assertLinkTokenUsable,
  consumeLinkToken,
  getActiveGrant,
  resolveLinkToken,
  touchGrant,
  type ResolvedLinkToken,
  upsertGrant,
} from '@/lib/access';
import { clearRateLimit, isRateLimited, rateLimitKey, registerFailure } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { maskName } from '@/lib/utils';

export const runtime = 'nodejs';

const schema = z
  .object({
    tokenOrCode: z.string().min(1).max(300).optional(),
    patientId: z.string().min(1).max(40).optional(),
  })
  .refine((v) => (v.tokenOrCode ? !v.patientId : !!v.patientId), {
    message: 'tokenOrCode ou patientId requis',
  });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    const key = rateLimitKey(session.user.id, 'link');
    if (isRateLimited(key).limited) throw new ApiError('RATE_LIMITED', 429);

    const body = await parseJson(request, schema);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, doctorId: doctor.id },
      select: { id: true, status: true, patientId: true, reason: true, consultedAt: true },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);
    if (consultation.status !== 'COMPLETED' || consultation.patientId) {
      throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    }

    let method: LinkMethod;
    let patientId: string;
    let patientUser: { id: string; fullName: string; locale: string };
    let token: ResolvedLinkToken | null = null;
    let grantIdToTouch: string | null = null;

    if (body.tokenOrCode) {
      token = await resolveLinkToken(body.tokenOrCode);
      if (!token) {
        registerFailure(key);
        await logAudit({
          userId: session.user.id,
          action: 'LINK_FAILED',
          entityType: 'Consultation',
          entityId: consultation.id,
          meta: { reason: 'INVALID' },
        });
        throw new ApiError('LINK_INVALID', 404);
      }
      try {
        assertLinkTokenUsable(token);
      } catch (error) {
        registerFailure(key);
        const reason =
          error instanceof ApiError && error.code === 'LINK_USED' ? 'USED' : 'EXPIRED';
        await logAudit({
          userId: session.user.id,
          action: 'LINK_FAILED',
          entityType: 'Consultation',
          entityId: consultation.id,
          meta: { reason },
        });
        throw error;
      }
      method = LinkMethod.PATIENT_QR;
      patientId = token.patientId;
      patientUser = token.patient.user;
    } else {
      // Cas 2 : grant actif requis, aucune donnée token.
      const grant = await getActiveGrant(doctor.id, body.patientId!);
      if (!grant) {
        registerFailure(key);
        await logAudit({
          userId: session.user.id,
          action: 'LINK_FAILED',
          entityType: 'Consultation',
          entityId: consultation.id,
          meta: { reason: 'GRANT_REQUIRED' },
        });
        throw new ApiError('GRANT_REQUIRED', 403);
      }
      const target = await prisma.patient.findUnique({
        where: { id: body.patientId! },
        select: { user: { select: { id: true, fullName: true, locale: true } } },
      });
      method = LinkMethod.ACCESS_GRANT;
      patientId = body.patientId!;
      patientUser = target!.user;
      grantIdToTouch = grant.id;
    }

    const linkedAt = new Date();
    await prisma.$transaction(async (tx) => {
      if (token) {
        await consumeLinkToken(tx, token);
        if (token.scope !== AccessScope.LINK_ONLY) {
          await upsertGrant(tx, {
            patientId: token.patientId,
            doctorId: doctor.id,
            scope: token.scope,
            durationMin: token.durationMin,
          });
        }
      }

      const updated = await tx.consultation.updateMany({
        where: { id: consultation.id, status: 'COMPLETED', patientId: null },
        data: { patientId, status: 'LINKED', linkedAt, linkMethod: method },
      });
      if (updated.count === 0) throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    });

    if (grantIdToTouch) await touchGrant(grantIdToTouch);
    if (token && token.scope !== AccessScope.LINK_ONLY) {
      await logAudit({
        userId: session.user.id,
        action: 'ACCESS_GRANTED',
        entityType: 'AccessGrant',
        entityId: undefined,
        meta: {
          patientId: token.patientId,
          scope: token.scope,
          context: 'LINK',
        },
      });
    }
    if (method === LinkMethod.ACCESS_GRANT) {
      await logAudit({
        userId: session.user.id,
        action: 'LINK_VIA_GRANT',
        entityType: 'Consultation',
        entityId: consultation.id,
        meta: { method: LinkMethod.ACCESS_GRANT },
      });
    }

    const doctorName = (
      await prisma.user.findUnique({ where: { id: session.user.id }, select: { fullName: true } })
    )?.fullName;
    const isAr = patientUser.locale === 'ar';
    await createNotification({
      userId: patientUser.id,
      title: isAr ? 'تمت إضافة استشارة جديدة' : 'Nouvelle consultation ajoutée',
      body: isAr
        ? `${doctorName ?? doctor.specialty} أضاف استشارة جديدة إلى ملفك.`
        : `${doctorName ?? doctor.specialty} a ajouté une consultation à votre dossier.`,
      href: `/patient/consultations/${consultation.id}`,
    });

    await logAudit({
      userId: session.user.id,
      action: 'LINK_SUCCESS',
      entityType: 'Consultation',
      entityId: consultation.id,
      meta: { method, patientId },
    });

    clearRateLimit(key);
    return {
      consultationId: consultation.id,
      patientName: maskName(patientUser.fullName),
      linkedAt,
    };
  });
}
