import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale?: Locale }>;
}): Promise<Metadata> {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale, namespace: 'ai' });
  return { title: t('main.title') };
}

/**
 * AI thread detail の stub (Phase 2-C Step C-3)
 *
 * Watching AI 本実装までの placeholder。
 * threadId のバリデーションは本実装時に format 確定後に追加。
 */
export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ locale?: Locale; threadId: string }>;
}) {
  const { locale = 'ja' } = await params;
  const t = await getTranslations({ locale, namespace: 'ai.thread' });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <h1 className="text-foreground text-lg font-medium">{t('placeholder.title')}</h1>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {t('placeholder.description')}
      </p>
    </div>
  );
}
