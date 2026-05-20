import { useTranslations } from 'next-intl';

import type { DateRangeDisplayProps } from '@/lib/components/common/DateRangeDisplay';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';

/**
 * Review の granularity を共通 DateRangeDisplay の props に変換するフック
 *
 * 週番号表示は useUserPreferenceStore.showWeekNumbers を参照し、
 * Calendar と Review で表示条件を共有する。
 */
export function useReviewDateDisplayProps(
  currentDate: Date,
  granularity: ReviewGranularity,
): DateRangeDisplayProps {
  const tCommon = useTranslations('common');
  const showWeekNumbers = useUserPreferenceStore((s) => s.showWeekNumbers);
  const weekStartsOn = useUserPreferenceStore((s) => s.weekStartsOn);

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
