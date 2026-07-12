import type { UseDayViewOptions, UseDayViewReturn } from '../../../../types/day-view.types';
import { useIsToday } from '../../shared/hooks/useIsToday';
import { useTimeblockStyles } from '../../shared/hooks/useTimeblockStyles';
import { useTimeSlots } from '../../shared/hooks/useTimeSlots';

import { useDayEntries } from './useDayEntries';

/** DayView のエントリ取得・スタイル計算・今日判定を集約したフック */
export function useDayView({
  date,
  entries,
  onEntryUpdate: _onEntryUpdate,
  timezone,
}: UseDayViewOptions): UseDayViewReturn {
  // エントリデータ処理
  const { dayEntries, entryPositions } = useDayEntries({ date, entries, timezone });

  // 今日かどうかの判定
  const isTodayFlag = useIsToday(date);

  // 時間スロットの生成（0:00-23:45、15分間隔）
  const timeSlots = useTimeSlots();

  // エントリのCSSスタイルを計算
  const entryStyles = useTimeblockStyles(entryPositions);

  // スクロール処理はScrollableCalendarLayoutに委譲

  return {
    dayEntries,
    entryStyles,
    isToday: isTodayFlag,
    timeSlots,
  };
}
