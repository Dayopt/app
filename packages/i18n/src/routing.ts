import { DEFAULT_LOCALE, LOCALE_PREFIX, SUPPORTED_LOCALES } from '@dayopt/config';
import { defineRouting } from 'next-intl/routing';

export type { Locale } from '@dayopt/config';

/** product / web で共有する next-intl routing 設定。 */
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: LOCALE_PREFIX,
});
