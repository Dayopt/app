import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/routing';

import { AiMainContent } from './_composition/AiMainContent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale, namespace: 'ai' });
  return { title: t('main.title') };
}

export default function AiPage() {
  return <AiMainContent />;
}
