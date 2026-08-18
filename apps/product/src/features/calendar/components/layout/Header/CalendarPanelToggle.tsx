'use client';

import { ChartNoAxesColumnIncreasing, GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, cn, HoverTooltip } from '@dayopt/components';

export type CalendarPanelTab = 'review' | 'diff';

interface CalendarPanelToggleProps {
  /** パネルが開いていてどのタブがアクティブか。閉じている場合は null */
  activeTab: CalendarPanelTab | null;
  onSelect: (tab: CalendarPanelTab) => void;
  diffDisabled: boolean;
  className?: string | undefined;
}

/**
 * ヘッダーの「振り返り」「差分」入口を1つに統合したセグメント切替（#2149 段階統合 Phase 1）
 *
 * 各セグメントを直接クリックすると該当タブが開いた状態でパネルが開く（手数は1手のまま）。
 */
export function CalendarPanelToggle({
  activeTab,
  onSelect,
  diffDisabled,
  className,
}: CalendarPanelToggleProps) {
  const t = useTranslations();

  return (
    <div
      className={cn('border-border flex items-center gap-0.5 rounded-lg border p-0.5', className)}
    >
      <HoverTooltip content={t('calendar.stats.review.tooltip')} side="bottom">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon
          className={cn(
            'text-muted-foreground hover:text-foreground',
            activeTab === 'review' && 'bg-state-selected text-foreground hover:bg-state-selected',
          )}
          aria-label={t('calendar.stats.review.ariaLabel')}
          aria-pressed={activeTab === 'review'}
          onClick={() => onSelect('review')}
        >
          <ChartNoAxesColumnIncreasing className="size-4" />
        </Button>
      </HoverTooltip>
      <HoverTooltip
        content={
          diffDisabled ? t('calendar.compare.unavailableTooltip') : t('calendar.compare.tooltip')
        }
        side="bottom"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon
          disabled={diffDisabled}
          className={cn(
            'text-muted-foreground hover:text-foreground',
            activeTab === 'diff' && 'bg-state-selected text-foreground hover:bg-state-selected',
          )}
          aria-label={t('calendar.compare.ariaLabel')}
          aria-pressed={activeTab === 'diff'}
          onClick={() => onSelect('diff')}
        >
          <GitCompareArrows className="size-4" />
        </Button>
      </HoverTooltip>
    </div>
  );
}
