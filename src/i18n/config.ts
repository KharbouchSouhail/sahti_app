export const locales = ['ar', 'fr'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'ar';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
