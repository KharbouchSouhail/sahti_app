import { describe, expect, it } from 'vitest';
import {
  clearRateLimit,
  isRateLimited,
  rateLimitKey,
  registerFailure,
} from '../src/lib/rate-limit';

describe('rate limiting', () => {
  it('is not limited before any failure', () => {
    const key = rateLimitKey('user-rate-a', 'link');
    expect(isRateLimited(key).limited).toBe(false);
  });

  it('allows up to 5 failures per minute', () => {
    const key = rateLimitKey('user-rate-b', 'link');
    for (let i = 0; i < 4; i++) registerFailure(key);
    expect(isRateLimited(key).limited).toBe(false);
    registerFailure(key);
    expect(isRateLimited(key).limited).toBe(true);
  });

  it('clears the limit after a success', () => {
    const key = rateLimitKey('user-rate-c', 'claim');
    for (let i = 0; i < 5; i++) registerFailure(key);
    expect(isRateLimited(key).limited).toBe(true);
    clearRateLimit(key);
    expect(isRateLimited(key).limited).toBe(false);
  });

  it('blocks for 15 minutes after 10 failures', () => {
    const key = rateLimitKey('user-rate-d', 'link');
    for (let i = 0; i < 10; i++) registerFailure(key);
    const state = isRateLimited(key);
    expect(state.limited).toBe(true);
    expect(state.retryAfterMs).toBeGreaterThan(14 * 60 * 1000);
  });

  it('keeps separate scopes independent', () => {
    const a = rateLimitKey('user-rate-e', 'link');
    const b = rateLimitKey('user-rate-e', 'claim');
    for (let i = 0; i < 5; i++) registerFailure(a);
    expect(isRateLimited(a).limited).toBe(true);
    expect(isRateLimited(b).limited).toBe(false);
  });
});
