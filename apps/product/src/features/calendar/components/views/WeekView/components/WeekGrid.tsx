'use client';

import React from 'react';

import { getWeek } from 'date-fns';

import { isTodayInTimezone } from '@/lib/date/timezone';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { cn } from '@/lib/utils';

import {
  CalendarDateHeader,
  DateDisplay,
  ScrollableCalendarLayout,
  getDateKey,
  useEntryStyles,
} from '../../shared';
import { CalendarGridContent } from '../../shared/components/CalendarGridContent';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import { useWeekEntries } from '../hooks/useWeekEntries';
import { toWeekDayEntryPosition } from '../utils/weekEntryPosition';

import type { WeekGridProps } from '../../../../types/week-view.types';

/**
 * WeekGrid - 週表示のメイングリッドコンポーネント
 *
 * @description
 * 7日分のグリッド管理:
 * - 各列の幅を均等分割（100% / 7）
 * - 列間のボーダー
 * - スクロール同期
 * - 現在時刻線の表示
 */
export const WeekGrid = ({
  weekDates,
  events,
  allEntries: _allEntries,
  eventsByDate: _eventsByDate,
  todayIndex: _todayIndex,
  disabledEntryId,
  onEventClick,
  onEventContextMenu,
  onEventUpdate,
  onTimeRangeSelect,
  className,
}: WeekGridProps) => {
  const timezone = useUserPreferenceStore((s) => s.timezone);
  const weekStartsOn = useUserPreferenceStore((s) => s.weekStartsOn);

  // レスポンシブな時間高さ
  const hourHeight = useResponsiveHourHeight();

  // onEventUpdate を CalendarGridContent が期待する (eventId, { startTime, endTime }) 型に変換
  const handleEventUpdate = React.useCallback(
    async (
      eventId: string,
      updates: {
        startTime: Date;
        endTime: Date;
        resetActualTime?: boolean;
      },
    ) => {
      if (!onEventUpdate) return;
      return onEventUpdate(eventId, updates);
    },
    [onEventUpdate],
  );

  // エントリ位置計算（TZ変換済みの日付グルーピングも取得）
  const { entryPositions, entriesByDate: tzEntriesByDate } = useWeekEntries({
    weekDates,
    events,
    hourHeight,
    timezone,
  });

  // entryPositions → entryStyles 変換（全日分をまとめて計算）
  const normalizedPositions = React.useMemo(
    () => entryPositions.map((pos) => toWeekDayEntryPosition(pos)),
    [entryPositions],
  );
  const entryStyles = useEntryStyles(normalizedPositions);

  // 週番号を計算（週の最初の日から）
  const weekNumber = React.useMemo(() => {
    const firstDate = weekDates[0];
    if (!firstDate) return undefined;
    return getWeek(firstDate, { weekStartsOn });
  }, [weekDates, weekStartsOn]);

  const headerComponent = (
    <div className="flex h-8 flex-1">
      {/* 7日分の日付ヘッダー */}
      {weekDates.map((date) => (
        <div
          key={date.toISOString()}
          className="flex items-center justify-center px-1"
          style={{ width: `${100 / weekDates.length}%` }}
        >
          <DateDisplay
            date={date}
            className="text-center"
            showDayName={true}
            showMonthYear={false}
            dayNameFormat="short"
            dateFormat="d"
            isToday={isTodayInTimezone(date, timezone)}
            isSelected={false}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {/* 固定日付ヘッダー */}
      <CalendarDateHeader header={headerComponent} weekNumber={weekNumber} />

      {/* スクロール可能コンテンツ */}
      <ScrollableCalendarLayout
        displayDates={weekDates}
        viewMode="week"
        enableKeyboardNavigation={true}
      >
        {/* 7日分のグリッド */}
        {weekDates.map((date, dayIndex) => {
          const dateKey = getDateKey(date);
          // TZ変換済みのentriesByDateを使用（eventsByDateはTZ未対応）
          const dayEvents = tzEntriesByDate[dateKey] || [];

          return (
            <div
              key={date.toISOString()}
              className={cn(
                'relative flex-1 overflow-visible',
                dayIndex < weekDates.length - 1 ? 'border-border border-r' : '',
              )}
              style={{ width: `${100 / weekDates.length}%` }}
            >
              <CalendarGridContent
                date={date}
                entries={dayEvents}
                entryStyles={entryStyles}
                viewMode="week"
                dayIndex={dayIndex}
                allEventsForOverlapCheck={events}
                displayDates={weekDates}
                onEntryClick={onEventClick}
                onEntryContextMenu={onEventContextMenu}
                onEventUpdate={handleEventUpdate}
                onTimeRangeSelect={onTimeRangeSelect}
                disabledEntryId={disabledEntryId}
                className="h-full"
              />
            </div>
          );
        })}
      </ScrollableCalendarLayout>
    </div>
  );
};
