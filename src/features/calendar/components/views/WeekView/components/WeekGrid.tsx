'use client';

import React from 'react';

import { getWeek, isToday } from 'date-fns';

import { cn } from '@/lib/utils';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import {
  CalendarDateHeader,
  DateDisplay,
  ScrollableCalendarLayout,
  getDateKey,
} from '../../shared';
import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import { useWeekEntries } from '../hooks/useWeekEntries';

import type { WeekGridProps } from '../WeekView.types';

import { WeekContent } from './WeekContent';

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
  const timezone = useCalendarSettingsStore((s) => s.timezone);

  // レスポンシブな時間高さ
  const hourHeight = useResponsiveHourHeight();

  // onEventUpdate を WeekContent が期待する型に変換
  const handleEntryUpdate = React.useCallback(
    async (
      entryId: string,
      updates: Partial<import('@/features/calendar/types/calendar.types').CalendarEvent>,
    ) => {
      if (!onEventUpdate) return;
      const entry = events.find((e) => e.id === entryId);
      if (!entry) return;
      // 返り値を伝播（繰り返しエントリ編集時の skipToast フラグ用）
      return onEventUpdate({ ...entry, ...updates });
    },
    [onEventUpdate, events],
  );

  // エントリ位置計算（TZ変換済みの日付グルーピングも取得）
  const { entryPositions, entriesByDate: tzEntriesByDate } = useWeekEntries({
    weekDates,
    events,
    hourHeight,
    timezone,
  });

  // 週番号を計算（週の最初の日から）
  const weekNumber = React.useMemo(() => {
    const firstDate = weekDates[0];
    if (!firstDate) return undefined;
    return getWeek(firstDate, { weekStartsOn: 1 });
  }, [weekDates]);

  const headerComponent = (
    <div className="bg-background flex h-8 flex-1">
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
            isToday={isToday(date)}
            isSelected={false}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className={cn('bg-background flex min-h-0 flex-1 flex-col', className)}>
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
              <WeekContent
                date={date}
                entries={dayEvents}
                allEventsForOverlapCheck={events}
                entryPositions={entryPositions}
                onEntryClick={onEventClick}
                onEntryContextMenu={onEventContextMenu}
                onEntryUpdate={handleEntryUpdate}
                onTimeRangeSelect={onTimeRangeSelect}
                disabledEntryId={disabledEntryId}
                className="h-full"
                dayIndex={dayIndex}
                displayDates={weekDates}
              />
            </div>
          );
        })}
      </ScrollableCalendarLayout>
    </div>
  );
};
