'use client';

import { isWeekend } from 'date-fns';

import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';

import { CalendarViewAnimation } from '../../animations/ViewTransition';

import { WeekGrid } from './components/WeekGrid';
import { useWeekView } from './hooks/useWeekView';

import type { WeekViewProps } from '../../../types/week-view.types';

/**
 * WeekView - 週表示ビューコンポーネント
 *
 * @description
 * 構成:
 * 1. shared/DateDisplay で7日分の日付表示
 * 2. ScrollableCalendarLayout（時間軸 + グリッド + 現在時刻線）
 * 3. 7つの WeekContent を横並び
 * 4. EntryCard でエントリ表示
 *
 * レイアウト:
 * ┌────┬────┬────┬────┬────┬────┬────┬────┐
 * │    │ 17 │ 18 │ 19 │ 20 │ 21 │ 22 │ 23 │
 * │    │ 日 │ 月 │ 火 │ 水 │ 木 │ 金 │ 土 │ ← DateDisplay
 * │    │    │    │    │ ● │    │    │    │ ← 今日マーカー
 * ├────┼────┼────┼────┼────┼────┼────┼────┤
 * │ 9  │    │ PL │    │    │ PL │    │    │
 * │10  │    │    │ PL │    │    │    │    │
 * └────┴────┴────┴────┴────┴────┴────┴────┘
 */
export const WeekView = ({
  dateRange,
  entries,
  allEntries,
  showWeekends = true,
  weekStartsOn: weekStartsOnProp,
  className,
  disabledEntryId,
  onEntryClick,
  onEntryContextMenu,
  onUpdateEntry,
  onTimeRangeSelect,
}: WeekViewProps) => {
  const weekStartsOnSetting = useUserPreferenceStore((s) => s.weekStartsOn);
  // 設定ストアの値を優先、プロップでオーバーライド可能
  const weekStartsOn = weekStartsOnProp ?? weekStartsOnSetting;

  // WeekView専用ロジック
  const { weekDates, eventsByDate, todayIndex } = useWeekView({
    startDate: dateRange.start,
    events: entries,
    weekStartsOn,
  });

  // 表示する日付を計算（土日を除外するかどうか）
  const displayDates = showWeekends ? weekDates : weekDates.filter((day) => !isWeekend(day));

  // 初期スクロールはScrollableCalendarLayoutに委譲

  return (
    <CalendarViewAnimation viewType="week">
      <WeekGrid
        weekDates={displayDates}
        events={entries}
        allEntries={allEntries}
        eventsByDate={eventsByDate}
        todayIndex={todayIndex}
        disabledEntryId={disabledEntryId}
        onEventClick={onEntryClick}
        onEventContextMenu={onEntryContextMenu}
        onEventUpdate={onUpdateEntry}
        onTimeRangeSelect={onTimeRangeSelect}
        className={className}
      />
    </CalendarViewAnimation>
  );
};
