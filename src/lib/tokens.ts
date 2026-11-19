import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** Alphabet sans caractères ambigus : pas de 0/O/1/I. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const TOKEN_LENGTH = 32;
export const LINK_TTL_MS = 5 * 60 * 1000;
export const CLAIM_TTL_MS = 72 * 60 * 60 * 1000;

export function randomString(length: number) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export function generateRawCode() {
  return randomString(CODE_LENGTH);
}

export function generateRawToken() {
  return randomString(TOKEN_LENGTH);
}

export function formatCode(code: string) {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

export function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isExpired(date: Date | string | null | undefined) {
  if (!date) return true;
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return Number.isNaN(time) || time <= Date.now();
}

export type NormalizedLink = {
  value: string;
  kind: 'token' | 'code';
};

/**
 * Normalise un QR payload (sehhati://link?t=… / sehhati://claim?c=… / URL https)
 * ou un code saisi manuellement.
 */
export function normalizeLinkInput(input: string): NormalizedLink | null {
  if (!input) return null;
  let raw = input.trim();
  if (!raw) return null;

  if (/^(sehhati:|https?:)/i.test(raw)) {
    let token = '';
    let code = '';
    try {
      const url = new URL(raw);
      token = url.searchParams.get('t') ?? url.searchParams.get('token') ?? '';
      code = url.searchParams.get('c') ?? url.searchParams.get('code') ?? '';
    } catch {
      const match = raw.match(/[?&](?:t|token|c|code)=([^&]+)/i);
      if (match) {
        const isToken = /[?&](t|token)=/i.test(match[0]);
        if (isToken) token = decodeURIComponent(match[1]);
        else code = decodeURIComponent(match[1]);
      }
    }
    if (token) {
      const clean = token.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (clean.length === TOKEN_LENGTH) return { value: clean, kind: 'token' };
    }
    if (code) {
      const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (clean.length === CODE_LENGTH) return { value: clean, kind: 'code' };
    }
    return null;
  }

  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length === TOKEN_LENGTH) return { value: clean, kind: 'token' };
  if (clean.length === CODE_LENGTH) return { value: clean, kind: 'code' };
  return null;
}

export function normalizeCode(input: string) {
  const clean = (input ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.length === CODE_LENGTH ? clean : null;
}

export function validateCodeShape(input: string) {
  return normalizeCode(input) !== null;
}

export function linkPayload(token: string) {
  return `sehhati://link?t=${token}`;
}

export function claimPayload(code: string) {
  return `sehhati://claim?c=${code.replace(/-/g, '')}`;
}

export function generateLinkTokenPair() {
  const token = generateRawToken();
  const code = generateRawCode();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  return {
    token,
    code,
    formattedCode: formatCode(code),
    tokenHash: sha256(token),
    codeHash: sha256(code),
    expiresAt,
  };
}

export function generateClaimCode() {
  const code = generateRawCode();
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);
  return {
    code,
    formattedCode: formatCode(code),
    codeHash: sha256(code),
    expiresAt,
  };
}
