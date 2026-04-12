'use client';

import { CompactDateNavigator } from '@/components/common/DateNavigator';
import type { DateRangeDisplayProps } from '@/components/common/DateRangeDisplay';
import { AppHeader } from '@/components/shell/AppHeader';

import type { NavigationDirection } from '@/components/common/DateNavigator';

import type { StatsGranularity } from '../../stores/useStatsFilterStore';
import { StatsDateDisplay } from './StatsDateDisplay';
import { StatsGranularitySelector } from './StatsGranularitySelector';

interface MobileStatsHeaderProps {
  dateDisplayProps: DateRangeDisplayProps;
  granularity: StatsGranularity;
  showGranularity: boolean;
  onNavigate: (direction: NavigationDirection) => void;
  onGranularityChange: (granularity: StatsGranularity) => void;
}

/**
 * モバイル専用 Stats ヘッダー
 *
 * MobileCalendarHeader と同じパターンで md:hidden。
 * コンパクト日付表示 + prev/next + 粒度セレクタ。
 */
export function MobileStatsHeader({
  dateDisplayProps,
  granularity,
  showGranularity,
  onNavigate,
  onGranularityChange,
}: MobileStatsHeaderProps) {
  return (
    <div className="bg-background sticky top-0 z-20 md:hidden">
      <AppHeader
        rightSlot={
          showGranularity ? (
            <StatsGranularitySelector
              granularity={granularity}
              onGranularityChange={onGranularityChange}
            />
          ) : undefined
        }
      >
        <div className="flex items-center gap-2">
          <StatsDateDisplay {...dateDisplayProps} />
          <CompactDateNavigator onNavigate={onNavigate} />
        </div>
      </AppHeader>
    </div>
  );
}
