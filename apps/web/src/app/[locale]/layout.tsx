import { routing, type Locale } from '@/platform/i18n/routing';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { legal, ossCredits, ...clientMessages } = messages as Record<string, unknown>;

  return <NextIntlClientProvider messages={clientMessages}>{children}</NextIntlClientProvider>;
}
