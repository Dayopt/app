import type { DateRangeDisplayProps } from '@/lib/components/common/DateRangeDisplay';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';

/**
 * Review の granularity を共通 DateRangeDisplay の props に変換するフック
 *
 * 週番号表示は useUserPreferences.showWeekNumbers を参照し、
 * Calendar と Review で表示条件を共有する。
 */
export function useReviewDateDisplayProps(
  currentDate: Date,
  _granularity: ReviewGranularity,
): DateRangeDisplayProps {
  const showWeekNumbers = useUserPreferences((s) => s.showWeekNumbers);
  const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);

  return {
    date: currentDate,
    showWeekNumber: showWeekNumbers,
    weekStartsOn,
  };
}
