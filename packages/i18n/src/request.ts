import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@dayopt/config';
import { getRequestConfig } from 'next-intl/server';

export type MessageLoader = (locale: Locale) => Promise<Record<string, unknown>>;

function resolveLocale(requestLocale: string | undefined): Locale {
  return SUPPORTED_LOCALES.find((locale) => locale === requestLocale) ?? DEFAULT_LOCALE;
}

/** app 固有の message loader を共通 locale 解決へ接続する。 */
export function createI18nRequestConfig(loadMessages: MessageLoader) {
  return getRequestConfig(async ({ requestLocale }) => {
    const locale = resolveLocale(await requestLocale);

    return {
      locale,
      messages: await loadMessages(locale),
    };
  });
}
