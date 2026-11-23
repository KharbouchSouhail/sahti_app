import { prisma } from '@/lib/prisma';
import { randomString, sha256 } from '@/lib/tokens';

export const RECORDER_SESSION_TTL_MS = 10 * 60 * 1000;

export async function createRecorderSession(input: {
  consultationId: string;
  recordingId: string;
}) {
  const token = randomString(32);
  let pairingCode = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomString(6);
    const exists = await prisma.recorderSession.findUnique({
      where: { pairingCode: candidate },
      select: { id: true },
    });
    if (!exists) {
      pairingCode = candidate;
      break;
    }
  }
  if (!pairingCode) throw new Error('PAIRING_CODE_GENERATION_FAILED');

  const session = await prisma.recorderSession.create({
    data: {
      consultationId: input.consultationId,
      recordingId: input.recordingId,
      tokenHash: sha256(token),
      pairingCode,
      expiresAt: new Date(Date.now() + RECORDER_SESSION_TTL_MS),
    },
  });

  return { session, token, pairingCode };
}

export async function resolveRecorderSession(sessionId: string, token: string) {
  if (!token) return null;
  const session = await prisma.recorderSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return null;
  if (session.tokenHash !== sha256(token)) return null;
  if (session.expiresAt <= new Date()) return null;
  return session;
}

export async function pairRecorderSession(code: string) {
  const session = await prisma.recorderSession.findUnique({
    where: { pairingCode: code.trim().toUpperCase() },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) return null;
  if (session.usedAt) return null;

  const token = randomString(32);
  await prisma.recorderSession.update({
    where: { id: session.id },
    data: { tokenHash: sha256(token) },
  });
  return { session, token };
}
