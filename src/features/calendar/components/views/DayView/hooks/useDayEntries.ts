import type { UseDayEntriesOptions, UseDayEntriesReturn } from '../../../../types/day-view.types';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import { useViewEntries } from '../../shared/hooks/useViewEntries';

/**
 * DayView用のエントリ処理フック
 * 共通のuseViewEntriesを使用
 */
export function useDayEntries({
  date,
  entries,
  timezone,
}: UseDayEntriesOptions): UseDayEntriesReturn {
  const hourHeight = useResponsiveHourHeight();
  return useViewEntries({ date, entries, hourHeight, timezone });
}
