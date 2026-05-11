'use client';

import { CompactDateNavigator } from '@/lib/components/common/DateNavigator';
import {
  CompactDateDisplay,
  type DateRangeDisplayProps,
} from '@/lib/components/common/DateRangeDisplay';
import { AppHeader } from '@/lib/components/shell/AppHeader';

import type { NavigationDirection } from '@/lib/components/common/DateNavigator';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';
import { ReviewGranularitySelector } from './ReviewGranularitySelector';

interface MobileReviewHeaderProps {
  dateDisplayProps: DateRangeDisplayProps;
  granularity: ReviewGranularity;
  showGranularity: boolean;
  onNavigate: (direction: NavigationDirection) => void;
  onGranularityChange: (granularity: ReviewGranularity) => void;
}

/**
 * モバイル専用 Stats ヘッダー
 *
 * MobileCalendarHeader と同じパターンで md:hidden。
 * コンパクト日付表示 + prev/next + 粒度セレクタ。
 */
export function MobileReviewHeader({
  dateDisplayProps,
  granularity,
  showGranularity,
  onNavigate,
  onGranularityChange,
}: MobileReviewHeaderProps) {
  return (
    <div className="bg-background sticky top-0 z-20 md:hidden">
      <AppHeader
        rightSlot={
          showGranularity ? (
            <ReviewGranularitySelector
              granularity={granularity}
              onGranularityChange={onGranularityChange}
            />
          ) : undefined
        }
      >
        <div className="flex items-center gap-2">
          <CompactDateDisplay {...dateDisplayProps} />
          <CompactDateNavigator onNavigate={onNavigate} />
        </div>
      </AppHeader>
    </div>
  );
}
