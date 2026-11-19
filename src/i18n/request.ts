import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isAppLocale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const safeLocale = isAppLocale(requested) ? requested : defaultLocale;
  return {
    locale: safeLocale,
    messages: (await import(`../../messages/${safeLocale}.json`)).default,
    timeZone: 'Africa/Casablanca',
  };
});
