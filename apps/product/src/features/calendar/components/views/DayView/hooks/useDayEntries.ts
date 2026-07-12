import type { UseDayEntriesOptions, UseDayEntriesReturn } from '../../../../types/day-view.types';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import { useViewTimeblocks } from '../../shared/hooks/useViewTimeblocks';

/**
 * DayView用のエントリ処理フック
 * 共通のuseViewTimeblocksを使用
 */
export function useDayEntries({
  date,
  entries,
  timezone,
}: UseDayEntriesOptions): UseDayEntriesReturn {
  const hourHeight = useResponsiveHourHeight();
  return useViewTimeblocks({ date, entries, hourHeight, timezone });
}
