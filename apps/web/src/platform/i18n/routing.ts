import { DEFAULT_LOCALE, LOCALE_PREFIX, SUPPORTED_LOCALES } from '@dayopt/config';
import { defineRouting } from 'next-intl/routing';

// locale 定義は @dayopt/config が source of truth
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: LOCALE_PREFIX,
});

export type Locale = (typeof routing.locales)[number];
