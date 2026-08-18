'use client';

import { BarChart3, GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dayopt/components';

import type { ReviewDisplayRange } from '../../lib/compute-date-range';
import { ReviewDiffPanel, type ReviewDiffResult } from '../diff/ReviewDiffPanel';
import { CalendarReviewPanel } from './CalendarReviewPanel';

type CalendarReviewTab = 'review' | 'diff';

interface CalendarReviewRailProps {
  activeTab: CalendarReviewTab;
  onTabChange: (tab: CalendarReviewTab) => void;
  diffTabDisabled: boolean;
  // 統計タブ（CalendarReviewPanel）
  currentDate: Date;
  displayRange: ReviewDisplayRange;
  selectedTagId: string | null;
  onSelectedTagIdChange: (tagId: string | null) => void;
  // 差分タブ（ReviewDiffPanel）
  diff: ReviewDiffResult | null;
  onDiffItemClick: (timeblockId: string) => void;
  variant?: 'rail' | 'sheet' | undefined;
  onClose?: (() => void) | undefined;
}

/**
 * ヘッダー統合 Phase 1（#2149）: 振り返り(統計)と差分を1つのパネル内タブで切り替える薄いラッパー。
 *
 * CalendarReviewPanel / ReviewDiffPanel は無改修のまま子として埋め込む。
 * データ取得経路の統合（tRPC集計 vs クライアント計算）は Phase 2 送り。
 */
export function CalendarReviewRail({
  activeTab,
  onTabChange,
  diffTabDisabled,
  currentDate,
  displayRange,
  selectedTagId,
  onSelectedTagIdChange,
  diff,
  onDiffItemClick,
  variant,
  onClose,
}: CalendarReviewRailProps) {
  const t = useTranslations();

  return (
    <div className="flex h-full flex-col">
      <div className="border-border-subtle flex shrink-0 gap-1 border-b px-4 pt-3">
        <button
          type="button"
          className={cn(
            'ease-standard flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
            activeTab === 'review'
              ? 'bg-state-selected text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={activeTab === 'review'}
          onClick={() => onTabChange('review')}
        >
          <BarChart3 className="size-3.5" aria-hidden="true" />
          {t('calendar.views.stats')}
        </button>
        <button
          type="button"
          disabled={diffTabDisabled}
          className={cn(
            'ease-standard flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
            activeTab === 'diff'
              ? 'bg-state-selected text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={activeTab === 'diff'}
          onClick={() => onTabChange('diff')}
        >
          <GitCompareArrows className="size-3.5" aria-hidden="true" />
          {t('calendar.compare.rail.title')}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {activeTab === 'diff' && diff ? (
          <ReviewDiffPanel
            diff={diff}
            {...(variant !== undefined ? { variant } : {})}
            onItemClick={onDiffItemClick}
            {...(onClose ? { onClose } : {})}
          />
        ) : (
          <CalendarReviewPanel
            currentDate={currentDate}
            displayRange={displayRange}
            selectedTagId={selectedTagId}
            onSelectedTagIdChange={onSelectedTagIdChange}
            onClose={onClose ?? (() => {})}
            {...(variant !== undefined ? { variant } : {})}
          />
        )}
      </div>
    </div>
  );
}
