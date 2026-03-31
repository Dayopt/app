import { useTranslations } from 'next-intl';

import type { DateRangeDisplayProps } from '@/components/ui/date-range-display';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import type { StatsGranularity } from '../../stores/useStatsFilterStore';

/**
 * Stats の granularity を共通 DateRangeDisplay の props に変換するフック
 *
 * 週番号表示は useCalendarSettingsStore.showWeekNumbers を参照し、
 * Calendar と Stats で設定を共有する。
 */
export function useStatsDateDisplayProps(
  currentDate: Date,
  granularity: StatsGranularity,
): DateRangeDisplayProps {
  const tCommon = useTranslations('common');
  const showWeekNumbers = useCalendarSettingsStore((s) => s.showWeekNumbers);

  // day / week 粒度のみ週番号を表示（Calendar と同じ条件）
  const showWeekNumber = showWeekNumbers && (granularity === 'day' || granularity === 'week');

  switch (granularity) {
    case 'day':
      return {
        date: currentDate,
        formatPattern: tCommon('dates.formats.monthDayYear'),
        showWeekNumber,
      };
    case 'week':
      return {
        date: currentDate,
        showWeekNumber,
      };
    case 'month':
      return {
        date: currentDate,
      };
    case 'year':
      return {
        date: currentDate,
        formatPattern: tCommon('dates.formats.yearOnly'),
      };
  }
}
