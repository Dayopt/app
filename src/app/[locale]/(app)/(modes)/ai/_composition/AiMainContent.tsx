'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * AI モードのメインエリア (empty state)
 *
 * Watching AI 未実装の placeholder として、Sparkles アイコン + 研究者トーンの
 * 短い説明を中央寄せで表示。CTA ボタンなし (起動できる機能がないため)。
 */
export function AiMainContent() {
  const t = useTranslations('ai.main');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <Sparkles className="text-muted-foreground size-10" aria-hidden="true" />
      <h1 className="text-foreground text-lg font-medium">{t('title')}</h1>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">{t('description')}</p>
    </div>
  );
}
