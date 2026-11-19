import { AccessScope, type AccessGrant, type PatientLinkToken, type Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { isExpired, normalizeLinkInput, sha256 } from '@/lib/tokens';

const SCOPE_RANK: Record<AccessScope, number> = {
  LINK_ONLY: 0,
  VITALS: 1,
  FULL: 2,
};

export function scopeRank(scope: AccessScope) {
  return SCOPE_RANK[scope] ?? 0;
}

/** Grant actif = non révoqué et non expiré. */
export async function getActiveGrant(doctorId: string, patientId: string) {
  const grant = await prisma.accessGrant.findUnique({
    where: { patientId_doctorId: { patientId, doctorId } },
  });
  if (!grant) return null;
  if (grant.revokedAt) return null;
  if (grant.expiresAt <= new Date()) return null;
  if (grant.scope === AccessScope.LINK_ONLY) return null;
  return grant;
}

/**
 * Exige un grant actif d'une portée minimale.
 * Réponse générique 403 : ne révèle pas si le patient existe.
 */
export async function assertGrant(
  doctorId: string,
  patientId: string,
  minScope: 'VITALS' | 'FULL',
) {
  const grant = await getActiveGrant(doctorId, patientId);
  if (!grant || scopeRank(grant.scope) < SCOPE_RANK[minScope]) {
    throw new ApiError('GRANT_REQUIRED', 403);
  }
  return grant;
}

/** Marque un accès (pour le journal et le compteur). */
export async function touchGrant(grantId: string) {
  await prisma.accessGrant.update({
    where: { id: grantId },
    data: { lastAccessAt: new Date(), accessCount: { increment: 1 } },
  });
}

export type GrantView = {
  id: string;
  patientId: string;
  doctorId: string;
  scope: AccessScope;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastAccessAt: Date | null;
  accessCount: number;
};

export function grantIsActive(grant: Pick<GrantView, 'expiresAt' | 'revokedAt'> | null | undefined) {
  if (!grant) return false;
  if (grant.revokedAt) return false;
  return grant.expiresAt > new Date();
}

/**
 * Crée ou prolonge le grant d'un couple (patient, médecin).
 * Appelé avec des données déjà validées (token non utilisé, scope non LINK_ONLY).
 * Retourne le grant upserté.
 */
export async function upsertGrant(
  tx: Prisma.TransactionClient,
  input: { patientId: string; doctorId: string; scope: AccessScope; durationMin: number },
) {
  const expiresAt = new Date(Date.now() + input.durationMin * 60_000);
  return tx.accessGrant.upsert({
    where: { patientId_doctorId: { patientId: input.patientId, doctorId: input.doctorId } },
    update: { scope: input.scope, expiresAt, revokedAt: null },
    create: {
      patientId: input.patientId,
      doctorId: input.doctorId,
      scope: input.scope,
      expiresAt,
    },
  });
}

/** Consomme un jeton (usage unique) à l'intérieur d'une transaction. */
export async function consumeLinkToken(tx: Prisma.TransactionClient, token: PatientLinkToken) {
  const consumed = await tx.patientLinkToken.updateMany({
    where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) throw new ApiError('LINK_USED', 409);
}

export const linkTokenInclude = {
  patient: {
    include: {
      user: { select: { id: true, fullName: true, locale: true } },
    },
  },
} as const;

export type ResolvedLinkToken = PatientLinkToken & {
  patient: { user: { id: string; fullName: string; locale: string } };
};

/**
 * Retrouve un jeton patient à partir d'une entrée libre (payload QR ou code 8 caractères).
 * Retourne null si l'entrée est malformée ou le jeton inconnu ; les vérifications
 * d'usage/expiration restent à la charge de l'appelant.
 */
export async function resolveLinkToken(raw: string): Promise<ResolvedLinkToken | null> {
  const normalized = normalizeLinkInput(raw);
  if (!normalized) return null;
  const hash = sha256(normalized.value);
  const token = await prisma.patientLinkToken.findFirst({
    where: { OR: [{ tokenHash: hash }, { codeHash: hash }] },
    include: linkTokenInclude,
  });
  return token as ResolvedLinkToken | null;
}

export function assertLinkTokenUsable(token: PatientLinkToken) {
  if (token.usedAt) throw new ApiError('LINK_USED', 409);
  if (isExpired(token.expiresAt)) throw new ApiError('LINK_EXPIRED', 410);
}
