'use client';

import { Frown, Meh, Smile } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { FulfillmentScore } from '@/features/entry';
import { cn } from '@/lib/utils';

const SCORE_OPTIONS: {
  score: FulfillmentScore;
  icon: typeof Smile;
  labelKey: 'fulfillmentTooltipLow' | 'fulfillmentTooltipMedium' | 'fulfillmentTooltipHigh';
}[] = [
  { score: 1, icon: Frown, labelKey: 'fulfillmentTooltipLow' },
  { score: 2, icon: Meh, labelKey: 'fulfillmentTooltipMedium' },
  { score: 3, icon: Smile, labelKey: 'fulfillmentTooltipHigh' },
];

/** 充実度スコア → 表示アイコン（採点状態インジケータ用） */
export const SCORE_ICONS: Record<FulfillmentScore, typeof Smile> = {
  1: Frown,
  2: Meh,
  3: Smile,
};

/**
 * FulfillmentScoreButtons — 3 段階の充実度トグルボタン群
 *
 * Inspector の FulfillmentRow と同じ操作系（選択中を再タップで解除）。
 * タイムラインの採点 Popover と確認待ちリストで共用する。
 */
export function FulfillmentScoreButtons({
  score,
  onChange,
}: {
  score: FulfillmentScore | null;
  onChange: (score: FulfillmentScore | null) => void;
}) {
  const t = useTranslations('entry.inspector.time');

  return (
    <div className="flex items-center gap-1">
      {SCORE_OPTIONS.map(({ score: value, icon: Icon, labelKey }) => {
        const isSelected = score === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={t(labelKey)}
            aria-pressed={isSelected}
            onClick={() => onChange(isSelected ? null : value)}
            className={cn(
              'flex size-10 items-center justify-center rounded-lg transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              isSelected
                ? 'bg-state-selected text-foreground'
                : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
            )}
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </div>
  );
}
