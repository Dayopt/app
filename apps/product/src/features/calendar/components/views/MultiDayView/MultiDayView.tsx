'use client';

import React, { useMemo } from 'react';

import { format, getWeek } from 'date-fns';

import { isTodayInTimezone } from '@/lib/date/timezone';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { cn } from '@dayopt/components';

import { CalendarViewAnimation } from '../../animations/ViewTransition';
import {
  CalendarDateHeader,
  DateDisplay,
  ScrollableCalendarLayout,
  useEntryStyles,
  useMultiDayEntryPositions,
} from '../shared';
import { useResponsiveHourHeight } from '../shared/hooks/useResponsiveHourHeight';

import type { MultiDayViewProps } from '../../../types/multi-day-view.types';
import { CalendarGridContent } from '../shared/components/CalendarGridContent';
import { useMultiDayView } from './hooks/useMultiDayView';

/**
 * MultiDayView - N日間表示の汎用コンポーネント（2〜9日間）
 */
export function MultiDayView({
  dayCount,
  dateRange: _dateRange,
  entries,
  allEntries: _allEntries,
  currentDate,
  centerDate: _centerDate,
  showWeekends = true,
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
}: MultiDayViewProps) {
  const timezone = useUserPreferences((s) => s.timezone);
  const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);
  const HOUR_HEIGHT = useResponsiveHourHeight();

  const displayCenterDate = useMemo(() => {
    const date = new Date(currentDate);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [currentDate]);

  const { displayDates } = useMultiDayView({
    centerDate: displayCenterDate,
    dayCount,
    timezone,
    events: entries,
    showWeekends,
  });

  const { entryPositions, entriesByDate } = useMultiDayEntryPositions({
    displayDates,
    entries,
    hourHeight: HOUR_HEIGHT,
    timezone,
  });

  const entryStyles = useEntryStyles(entryPositions);

  // onUpdateEntry を CalendarGridContent が期待する (eventId, { startTime, endTime }) 型に変換
  const handleEventUpdate = React.useCallback(
    async (
      eventId: string,
      updates: {
        startTime: Date;
        endTime: Date;
        resetActualTime?: boolean;
      },
    ) => {
      if (!onUpdateEntry) return;
      return onUpdateEntry(eventId, updates);
    },
    [onUpdateEntry],
  );

  const weekNumber = useMemo(() => {
    return getWeek(displayCenterDate, { weekStartsOn });
  }, [displayCenterDate, weekStartsOn]);

  const viewMode = `${dayCount}day` as '3day' | '5day';

  const headerComponent = (
    <div className="flex h-8">
      {displayDates.map((date) => (
        <div key={date.toISOString()} className="flex flex-1 items-center justify-center px-1">
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
    <CalendarViewAnimation viewType={viewMode}>
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <CalendarDateHeader header={headerComponent} weekNumber={weekNumber} />

        <ScrollableCalendarLayout
          displayDates={displayDates}
          viewMode={viewMode}
          enableKeyboardNavigation={true}
        >
          {displayDates.map((date, dayIndex) => {
            const dateKey = format(date, 'yyyy-MM-dd');
            const dayEntries = entriesByDate.get(dateKey) || [];

            return (
              <div
                key={date.toISOString()}
                className={cn(
                  'relative flex-1',
                  dayIndex < displayDates.length - 1 && 'border-border border-r',
                )}
                style={{ width: `${100 / displayDates.length}%` }}
              >
                <CalendarGridContent
                  date={date}
                  entries={dayEntries}
                  entryStyles={entryStyles}
                  viewMode={viewMode}
                  dayIndex={dayIndex}
                  allEventsForOverlapCheck={entries}
                  displayDates={displayDates}
                  onEntryClick={onEntryClick}
                  onEntryContextMenu={onEntryContextMenu}
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
    </CalendarViewAnimation>
  );
}
