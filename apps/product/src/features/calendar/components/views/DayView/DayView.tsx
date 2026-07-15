'use client';

import React, { useMemo } from 'react';

import { getWeek } from 'date-fns';

import { cn } from '@dayopt/components';

import { ConfirmDayButton } from '@/features/timeblock';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';

import { CalendarViewAnimation } from '../../animations/ViewTransition';
import { CalendarDateHeader, DateDisplay, ScrollableCalendarLayout } from '../shared';
import { CalendarGridContent } from '../shared/components/CalendarGridContent';

import type { DayViewProps } from '../../../types/day-view.types';
import { useDayView } from './hooks/useDayView';

/** 1日表示のカレンダービューコンポーネント */
export const DayView = ({
  dateRange: _dateRange,
  entries,
  allTimeblocks,
  currentDate,
  showWeekends: _showWeekends = true,
  showActualDiff: _showActualDiff = false,
  dayDiffEntryIds,
  className,
  disabledTimeblockId,
  onEntryClick,
  onEntryContextMenu,
  onUpdateEntry,
  onDeleteTimeblock: _onDeleteTimeblock,
  onTimeRangeSelect,
  onViewChange: _onViewChange,
  onNavigatePrev: _onNavigatePrev,
  onNavigateNext: _onNavigateNext,
  onNavigateToday: _onNavigateToday,
}: DayViewProps) => {
  const timezone = useUserPreferences((s) => s.timezone);
  const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);

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
    timeblockStyles: _eventStyles,
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

  // 過去日 + 未記録 plan あり = confirmDay 導線を出す。
  // 記録済み判定は同日 entries 内の record.planId 参照で行う（他日への持ち越し記録は稀なため対象外）。
  const dayEnd = useMemo(() => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [date]);
  const hasUnrecordedPastPlans = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- confirmDay 導線の表示判定。entries 変更時の再評価で十分（TimeblockContextMenu と同じ運用）
    const now = Date.now();
    const list = entries ?? [];
    return list.some(
      (e) =>
        e.kind === 'plan' &&
        !e.isSkipped &&
        e.endDate != null &&
        e.endDate.getTime() <= now &&
        !list.some((record) => record.kind === 'record' && record.planId === e.id),
    );
  }, [entries]);

  const headerComponent = (
    <div className="flex h-8 items-center justify-between gap-2 px-2">
      <div className="flex-1" />
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
      <div className="flex flex-1 justify-end">
        {hasUnrecordedPastPlans && <ConfirmDayButton startAt={date} endAt={dayEnd} />}
      </div>
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
            viewMode="day"
            dayIndex={0}
            allEventsForOverlapCheck={allTimeblocks ?? entries}
            onEntryClick={onEntryClick}
            onEntryContextMenu={onEntryContextMenu}
            onEventUpdate={handleEventTimeUpdate}
            onTimeRangeSelect={onTimeRangeSelect}
            disabledTimeblockId={disabledTimeblockId}
            dayDiffEntryIds={dayDiffEntryIds}
            className="absolute inset-y-0 right-0 left-0"
          />
        </ScrollableCalendarLayout>
      </div>
    </CalendarViewAnimation>
  );
};
