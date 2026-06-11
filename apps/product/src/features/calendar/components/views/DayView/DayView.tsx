'use client';

import React, { useMemo } from 'react';

import { getWeek } from 'date-fns';

import { cn } from '@/lib/utils';

import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';

import { CalendarViewAnimation } from '../../animations/ViewTransition';
import { CalendarDateHeader, DateDisplay, ScrollableCalendarLayout } from '../shared';
import { CalendarGridContent } from '../shared/components/CalendarGridContent';

import type { DayViewProps } from '../../../types/day-view.types';
import { useDayView } from './hooks/useDayView';

/** 1日表示のカレンダービューコンポーネント */
export const DayView = ({
  dateRange: _dateRange,
  entries,
  allEntries: _allEntries,
  currentDate,
  showWeekends: _showWeekends = true,
  className,
  disabledEntryId,
  onEntryClick,
  onEntryContextMenu,
  onUpdateEntry,
  onDeleteEntry: _onDeleteEntry,
  onTimeRangeSelect,
  onViewChange: _onViewChange,
  onNavigatePrev: _onNavigatePrev,
  onNavigateNext: _onNavigateNext,
  onNavigateToday: _onNavigateToday,
}: DayViewProps) => {
  const timezone = useUserPreferenceStore((s) => s.timezone);
  const weekStartsOn = useUserPreferenceStore((s) => s.weekStartsOn);

  // 表示する日付
  const displayDates = useMemo(() => {
    const date = new Date(currentDate);
    date.setHours(0, 0, 0, 0);
    return [date];
  }, [currentDate]);

  // 最初の日付を使用（Day表示なので1日のみ）
  const date = displayDates[0];
  if (!date) {
    throw new Error('Display date is undefined');
  }

  // ドラッグイベント用のハンドラー（エントリ時間更新）
  const handleEventTimeUpdate = React.useCallback(
    async (
      eventId: string,
      updates: {
        startTime: Date;
        endTime: Date;
        resetActualTime?: boolean;
      },
    ) => {
      if (onUpdateEntry) {
        // 返り値を伝播（繰り返しエントリ編集時の skipToast フラグ用）
        return await onUpdateEntry(eventId, updates);
      }
    },
    [onUpdateEntry],
  );

  // DayView専用ロジック（CalendarControllerから渡されたエントリデータを使用）
  const {
    dayEntries: dayEvents,
    entryStyles: eventStyles,
    isToday,
    timeSlots: _timeSlots,
  } = useDayView({
    date,
    entries: entries || [],
    ...(onUpdateEntry && { onEntryUpdate: onUpdateEntry }),
    timezone,
  });

  // 週番号を計算
  const weekNumber = useMemo(() => {
    return getWeek(date, { weekStartsOn });
  }, [date, weekStartsOn]);

  const headerComponent = (
    <div className="flex h-8 items-center justify-center px-2">
      <DateDisplay
        date={date}
        className="text-center"
        showDayName={true}
        showMonthYear={false}
        dayNameFormat="short"
        dateFormat="d"
        isToday={isToday}
        isSelected={false}
      />
    </div>
  );

  return (
    <CalendarViewAnimation viewType="day">
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        {/* 固定日付ヘッダー */}
        <CalendarDateHeader
          header={headerComponent}
          weekNumber={weekNumber}
          className="hidden md:flex"
        />

        {/* スクロール可能コンテンツ */}
        <ScrollableCalendarLayout displayDates={displayDates} viewMode="day">
          {/* 日のコンテンツ */}
          <CalendarGridContent
            date={date}
            entries={dayEvents}
            entryStyles={eventStyles}
            viewMode="day"
            dayIndex={0}
            onEntryClick={onEntryClick}
            onEntryContextMenu={onEntryContextMenu}
            onEventUpdate={handleEventTimeUpdate}
            onTimeRangeSelect={onTimeRangeSelect}
            disabledEntryId={disabledEntryId}
            className="absolute inset-y-0 right-0 left-0"
          />
        </ScrollableCalendarLayout>
      </div>
    </CalendarViewAnimation>
  );
};
