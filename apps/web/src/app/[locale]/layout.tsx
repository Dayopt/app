import { routing, type Locale } from '@dayopt/i18n/routing';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { BrowserTelemetry } from '@/shell/privacy/BrowserTelemetry';
import { CookieConsentBanner } from '@/shell/privacy/CookieConsentBanner';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  const messages = await getMessages();

  // Client Component が使わない重いネームスペースを除外（legal: ~96KB）
  // legal/ossCredits は Server Component で getTranslations() 経由で直接取得する
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- rest destructuring で除外する legal/ossCredits は意図的に未使用
  const { legal, ossCredits, ...clientMessages } = messages as Record<string, unknown>;

  return (
    <NextIntlClientProvider messages={clientMessages}>
      {children}
      <BrowserTelemetry />
      <CookieConsentBanner />
    </NextIntlClientProvider>
  );
}
