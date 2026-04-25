'use client';

import { AlertCircle, FileText, Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * AI モード Sidebar 中身 (Watching AI placeholder)
 *
 * 3 ブロック構成 (phase-2-c-step-3-detail.md §5):
 * - ブロック 1: タイトル "Watching AI"
 * - ブロック 2: 空 Conversations list (描画構造のみ、空状態メッセージ)
 * - ブロック 3: Soon セクション (予定機能 3 項目、disabled 見た目で clickable 不可)
 */
export function AiSidebar() {
  const t = useTranslations('ai.sidebar');

  return (
    <div className="flex flex-col gap-4 px-2">
      <h2 className="text-foreground px-2 pt-2 text-sm font-medium">{t('title')}</h2>

      <div className="px-2">
        <p className="text-muted-foreground text-sm">{t('conversations.empty')}</p>
      </div>

      <AiSoonList />
    </div>
  );
}

const SOON_ITEMS = [
  { key: 'weeklyReport', Icon: FileText },
  { key: 'insights', Icon: Lightbulb },
  { key: 'anomaly', Icon: AlertCircle },
] as const;

function AiSoonList() {
  const t = useTranslations('ai.sidebar.soon');

  return (
    <div className="flex flex-col gap-2 px-2">
      <span className="text-muted-foreground text-xs uppercase">{t('label')}</span>
      {SOON_ITEMS.map(({ key, Icon }) => (
        <div
          key={key}
          className="text-muted-foreground flex flex-col gap-1 py-1"
          aria-disabled="true"
        >
          <div className="flex items-center gap-2">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="text-sm">{t(`${key}.title`)}</span>
          </div>
          <span className="text-xs">{t(`${key}.description`)}</span>
        </div>
      ))}
    </div>
  );
}
