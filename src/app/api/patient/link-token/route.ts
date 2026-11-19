import { z } from 'zod';
import { AccessScope } from '@prisma/client';
import { handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';
import { isExpired, generateLinkTokenPair, linkPayload } from '@/lib/tokens';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const durationSchema = z.union([z.literal(60), z.literal(120), z.literal(1440)]);
const schema = z.object({
  // Choix explicite obligatoire : aucune portée par défaut côté UI.
  scope: z.nativeEnum(AccessScope),
  durationMin: durationSchema.default(120),
});

/** Génère un nouveau jeton temporaire (invalide les précédents non utilisés). */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);
    const body = await parseJson(request, schema);

    await prisma.patientLinkToken.deleteMany({
      where: { patientId: patient.id, usedAt: null },
    });

    const pair = generateLinkTokenPair();
    const token = await prisma.patientLinkToken.create({
      data: {
        patientId: patient.id,
        tokenHash: pair.tokenHash,
        codeHash: pair.codeHash,
        expiresAt: pair.expiresAt,
        scope: body.scope,
        durationMin: body.durationMin,
      },
    });

    await logAudit({
      userId: session.user.id,
      action: 'PATIENT_QR_GENERATED',
      entityType: 'PatientLinkToken',
      entityId: token.id,
      meta: { scope: body.scope, durationMin: body.durationMin },
    });

    return {
      qrPayload: linkPayload(pair.token),
      code: pair.formattedCode,
      expiresAt: pair.expiresAt,
      scope: body.scope,
      durationMin: body.durationMin,
    };
  });
}

/** Statut du dernier jeton (polling côté patient). */
export async function GET() {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);

    const token = await prisma.patientLinkToken.findFirst({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) return { status: 'none' as const };

    if (token.usedAt) {
      const consultation = await prisma.consultation.findFirst({
        where: { patientId: patient.id, linkedAt: { gte: token.createdAt } },
        orderBy: { linkedAt: 'desc' },
        include: { doctor: { include: { user: { select: { fullName: true } } } } },
      });
      let grantExpiresAt: Date | null = null;
      if (token.scope !== 'LINK_ONLY') {
        const grant = await prisma.accessGrant.findFirst({
          where: { patientId: patient.id, revokedAt: null, createdAt: { gte: token.createdAt } },
          orderBy: { expiresAt: 'desc' },
        });
        grantExpiresAt = grant?.expiresAt ?? null;
      }
      return {
        status: 'used' as const,
        usedAt: token.usedAt,
        consultationId: consultation?.id ?? null,
        doctorName: consultation?.doctor.user.fullName ?? null,
        linkedAt: consultation?.linkedAt ?? null,
        scope: token.scope as AccessScope,
        durationMin: token.durationMin,
        grantExpiresAt,
      };
    }

    if (isExpired(token.expiresAt)) {
      return { status: 'expired' as const, expiresAt: token.expiresAt, scope: token.scope };
    }

    return { status: 'active' as const, expiresAt: token.expiresAt, scope: token.scope };
  });
}

export async function DELETE() {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);
    await prisma.patientLinkToken.deleteMany({ where: { patientId: patient.id, usedAt: null } });
    return { ok: true };
  });
}
