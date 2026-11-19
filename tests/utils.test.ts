import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatCountdown,
  initials,
  maskName,
  pluralize,
  slugify,
  toDateInputValue,
} from '../src/lib/utils';

describe('maskName', () => {
  it('keeps the first name and the last initial', () => {
    expect(maskName('Salma Idrissi')).toBe('Salma I.');
  });

  it('strips honorific prefixes', () => {
    expect(maskName('Dr. Youssef Alami')).toBe('Youssef A.');
  });

  it('returns the single name unchanged', () => {
    expect(maskName('Salma')).toBe('Salma');
  });
});

describe('initials', () => {
  it('uses the first and last parts, ignoring Dr prefix', () => {
    expect(initials('Dr. Salma Idrissi')).toBe('SI');
  });

  it('returns two letters for a single name', () => {
    expect(initials('Salma')).toBe('SA');
  });
});

describe('pluralize', () => {
  it('singular and naive plural', () => {
    expect(pluralize(1, 'consultation')).toBe('consultation');
    expect(pluralize(2, 'consultation')).toBe('consultations');
    expect(pluralize(2, 'consultation', 'consultations (fr)')).toBe('consultations (fr)');
  });
});

describe('clamp', () => {
  it('clamps to bounds', () => {
    expect(clamp(12, 1, 10)).toBe(10);
    expect(clamp(-3, 1, 10)).toBe(1);
    expect(clamp(5, 1, 10)).toBe(5);
  });
});

describe('formatCountdown', () => {
  it('formats mm:ss', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(90)).toBe('01:30');
    expect(formatCountdown(5)).toBe('00:05');
  });
});

describe('slugify', () => {
  it('normalizes and hyphenates', () => {
    expect(slugify('Dr. Salma Idrissi')).toBe('dr-salma-idrissi');
    expect(slugify('Hôpital Central')).toBe('hopital-central');
  });
});

describe('toDateInputValue', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toDateInputValue('2026-11-19T08:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toDateInputValue('not a date')).toBe('');
    expect(toDateInputValue(null)).toBe('');
  });
});
