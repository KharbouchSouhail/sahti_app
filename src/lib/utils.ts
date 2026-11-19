import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AppLocale } from '@/i18n/config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOCALE_TAG: Record<AppLocale, string> = {
  ar: 'ar-MA-u-nu-latn-ca-gregory',
  fr: 'fr-FR',
};

export function dateLocale(locale: string) {
  return LOCALE_TAG[(locale as AppLocale) ?? 'ar'] ?? LOCALE_TAG.ar;
}

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
) {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(dateLocale(locale), options).format(date);
}

export function formatMonth(value: Date | string, locale: string) {
  return formatDate(value, locale, { month: 'long', year: 'numeric' });
}

export function formatTime(value: Date | string, locale: string) {
  return formatDate(value, locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateTime(value: Date | string, locale: string) {
  return `${formatDate(value, locale)} · ${formatTime(value, locale)}`;
}

export function formatShortDate(value: Date | string | null | undefined, locale: string) {
  return formatDate(value, locale, { day: '2-digit', month: 'short' });
}

export function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function initials(name: string) {
  const parts = name
    .replace(/^(Dr\.?|Docteur|الدكتور|د\.)\s*/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function maskName(name: string) {
  const parts = name.replace(/^(Dr\.?|Docteur)\s*/i, '').trim().split(/\s+/);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function firstName(name: string) {
  return name.replace(/^(Dr\.?|Docteur)\s*/i, '').trim().split(/\s+/)[0] ?? name;
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : plural ?? `${singular}s`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function secondsUntil(date: Date | string) {
  const target = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return Math.max(0, Math.floor((target - Date.now()) / 1000));
}

export function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
