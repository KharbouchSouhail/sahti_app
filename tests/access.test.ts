import { describe, expect, it } from 'vitest';
import { AccessScope } from '@prisma/client';
import { grantIsActive, scopeRank } from '../src/lib/access';

describe('scopeRank', () => {
  it('orders scopes LINK_ONLY < VITALS < FULL', () => {
    expect(scopeRank(AccessScope.LINK_ONLY)).toBeLessThan(scopeRank(AccessScope.VITALS));
    expect(scopeRank(AccessScope.VITALS)).toBeLessThan(scopeRank(AccessScope.FULL));
  });
});

describe('grantIsActive', () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it('is active for a non-revoked, non-expired grant', () => {
    expect(grantIsActive({ expiresAt: future, revokedAt: null })).toBe(true);
  });

  it('is inactive after expiry', () => {
    expect(grantIsActive({ expiresAt: past, revokedAt: null })).toBe(false);
  });

  it('is inactive after revocation', () => {
    expect(grantIsActive({ expiresAt: future, revokedAt: new Date() })).toBe(false);
  });

  it('is inactive for a missing grant', () => {
    expect(grantIsActive(null)).toBe(false);
    expect(grantIsActive(undefined)).toBe(false);
  });
});
