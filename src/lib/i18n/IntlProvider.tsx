/**
 * ルートグループ用 i18n Provider
 *
 * NextIntlClientProvider + CookieConsentBanner をまとめて提供する。
 * 各ルートグループlayoutで使うことで、Provider配置とバナーの重複を排除する。
 */
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { CookieConsentBanner } from '@/lib/components/shell/CookieConsentBanner';

import { pickMessages } from './index';

interface IntlProviderProps {
  namespaces: string[];
  children: React.ReactNode;
}

export async function IntlProvider({ namespaces, children }: IntlProviderProps) {
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={pickMessages(messages, namespaces)}>
      {children}
      <CookieConsentBanner />
    </NextIntlClientProvider>
  );
}
