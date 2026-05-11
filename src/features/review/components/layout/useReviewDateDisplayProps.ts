import type { DateRangeDisplayProps } from '@/lib/components/common/DateRangeDisplay';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';

/**
 * Review の日付表示を共通 DateRangeDisplay の props に変換するフック
 *
 * 週番号表示は useCalendarSettingsStore.showWeekNumbers を参照し、
 * Calendar と Review で表示条件を共有する。
 */
export function useReviewDateDisplayProps(currentDate: Date): DateRangeDisplayProps {
  const showWeekNumbers = useCalendarSettingsStore((s) => s.showWeekNumbers);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  return {
    date: currentDate,
    showWeekNumber: showWeekNumbers,
    weekStartsOn,
  };
}
