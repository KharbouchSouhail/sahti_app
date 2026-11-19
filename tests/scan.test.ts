import { describe, expect, it } from 'vitest';
import { extractClaimCode, formatScanCode } from '../src/lib/scan';

describe('extractClaimCode', () => {
  it('extracts the code from a claim QR payload', () => {
    expect(extractClaimCode('sehhati://claim?c=K7M29QXP')).toBe('K7M29QXP');
  });

  it('extracts the code from an https link', () => {
    expect(extractClaimCode('https://sehhati.ma/claim?code=K7M2-9QXP')).toBe('K7M29QXP');
  });

  it('accepts a raw code with separators', () => {
    expect(extractClaimCode(' k7m2-9qxp ')).toBe('K7M29QXP');
  });

  it('rejects values that are not eight characters', () => {
    expect(extractClaimCode('ABC')).toBeNull();
    expect(extractClaimCode('')).toBeNull();
  });
});

describe('formatScanCode', () => {
  it('formats a scanned payload', () => {
    expect(formatScanCode('sehhati://claim?c=K7M29QXP')).toBe('K7M2-9QXP');
    expect(formatScanCode('bad')).toBeNull();
  });
});
