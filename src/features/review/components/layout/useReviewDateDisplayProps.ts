import { useTranslations } from 'next-intl';

import type { DateRangeDisplayProps } from '@/lib/components/common/DateRangeDisplay';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';

/**
 * Stats の granularity を共通 DateRangeDisplay の props に変換するフック
 *
 * 週番号表示は useCalendarSettingsStore.showWeekNumbers を参照し、
 * Calendar と Stats で設定を共有する。
 */
export function useReviewDateDisplayProps(
  currentDate: Date,
  granularity: ReviewGranularity,
): DateRangeDisplayProps {
  const tCommon = useTranslations('common');
  const showWeekNumbers = useCalendarSettingsStore((s) => s.showWeekNumbers);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  // day / week 粒度のみ週番号を表示（Calendar と同じ条件）
  const showWeekNumber = showWeekNumbers && (granularity === 'day' || granularity === 'week');

  switch (granularity) {
    case 'day':
      return {
        date: currentDate,
        formatPattern: tCommon('dates.formats.monthDayYear'),
        showWeekNumber,
        weekStartsOn,
      };
    case 'week':
      return {
        date: currentDate,
        showWeekNumber,
        weekStartsOn,
      };
    case 'month':
      return {
        date: currentDate,
        weekStartsOn,
      };
    case 'year':
      return {
        date: currentDate,
        formatPattern: tCommon('dates.formats.yearOnly'),
        weekStartsOn,
      };
  }
}
