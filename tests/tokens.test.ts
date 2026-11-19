import { describe, expect, it } from 'vitest';
import {
  CLAIM_TTL_MS,
  LINK_TTL_MS,
  claimPayload,
  formatCode,
  generateClaimCode,
  generateLinkTokenPair,
  isExpired,
  linkPayload,
  normalizeCode,
  normalizeLinkInput,
  sha256,
} from '../src/lib/tokens';

describe('formatCode', () => {
  it('formats eight characters with a hyphen', () => {
    expect(formatCode('K7M29QXP')).toBe('K7M2-9QXP');
  });

  it('strips separators and lowercases to uppercase', () => {
    expect(formatCode('k7m2-9qxp')).toBe('K7M2-9QXP');
  });
});

describe('sha256', () => {
  it('is deterministic and hex encoded', () => {
    const first = sha256('sehhati');
    expect(first).toBe(sha256('sehhati'));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(sha256('sehhati2'));
  });
});

describe('generateLinkTokenPair', () => {
  it('creates a 32 character token, 8 character code and matching hashes', () => {
    const pair = generateLinkTokenPair();
    expect(pair.token).toHaveLength(32);
    expect(pair.code).toHaveLength(8);
    expect(pair.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(pair.tokenHash).toBe(sha256(pair.token));
    expect(pair.codeHash).toBe(sha256(pair.code));
    expect(pair.formattedCode).toBe(formatCode(pair.code));
    expect(pair.expiresAt.getTime()).toBeGreaterThan(Date.now() + LINK_TTL_MS - 5_000);
  });
});

describe('generateClaimCode', () => {
  it('expires roughly 72 hours later', () => {
    const claim = generateClaimCode();
    expect(claim.code).toHaveLength(8);
    expect(claim.codeHash).toBe(sha256(claim.code));
    const delta = claim.expiresAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(CLAIM_TTL_MS - 5_000);
    expect(delta).toBeLessThanOrEqual(CLAIM_TTL_MS + 5_000);
  });
});

describe('normalizeLinkInput', () => {
  const pair = generateLinkTokenPair();

  it('reads a patient QR token payload', () => {
    expect(normalizeLinkInput(linkPayload(pair.token))).toEqual({
      value: pair.token,
      kind: 'token',
    });
  });

  it('reads a claim QR code payload', () => {
    expect(normalizeLinkInput(claimPayload(pair.code))).toEqual({
      value: pair.code,
      kind: 'code',
    });
  });

  it('accepts a manually typed code with separators', () => {
    expect(normalizeLinkInput(pair.formattedCode.toLowerCase())).toEqual({
      value: pair.code,
      kind: 'code',
    });
  });

  it('rejects malformed values', () => {
    expect(normalizeLinkInput('')).toBeNull();
    expect(normalizeLinkInput('hello')).toBeNull();
    expect(normalizeLinkInput('sehhati://link?t=abc')).toBeNull();
  });
});

describe('normalizeCode', () => {
  it('returns only eight character codes', () => {
    expect(normalizeCode('k7m2-9qxp')).toBe('K7M29QXP');
    expect(normalizeCode('123')).toBeNull();
  });
});

describe('isExpired', () => {
  it('handles dates in the past and future', () => {
    expect(isExpired(new Date(Date.now() - 1_000))).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false);
    expect(isExpired(null)).toBe(true);
    expect(isExpired('not-a-date')).toBe(true);
  });
});
