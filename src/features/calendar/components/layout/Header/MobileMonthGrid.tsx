'use client';

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';

import { useCalendarSettingsStore } from '@/features/calendar/stores/useCalendarSettingsStore';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { cn } from '@/lib/utils';

import { useSwipeGesture } from '../../../hooks/useSwipeGesture';

/** 週の開始日に応じた曜日配列を回転 */
function rotateWeekdays(weekdaysNarrow: string[], weekStartsOn: 0 | 1 | 6): string[] {
  return [...weekdaysNarrow.slice(weekStartsOn), ...weekdaysNarrow.slice(0, weekStartsOn)];
}

interface MobileMonthGridProps {
  viewMonth: Date;
  selectedDate: Date;
  displayRange?: { start: Date; end: Date } | undefined;
  onViewMonthChange: (newMonth: Date) => void;
  onDateSelect: (date: Date) => void;
  className?: string | undefined;
}

/**
 * モバイル専用クロムレス月グリッド
 *
 * Google Calendar準拠: ナビゲーションUIなし、スワイプのみで月移動。
 * セル高さ44px（WCAG 2.5.5 のタッチターゲット最小サイズ準拠）。
 */
export const MobileMonthGrid = memo<MobileMonthGridProps>(
  ({ viewMonth, selectedDate, onViewMonthChange, onDateSelect, className }) => {
    const tCommon = useTranslations('common');
    const weekStartsOn = useCalendarSettingsStore((state) => state.weekStartsOn);
    const showWeekNumbers = useCalendarSettingsStore((state) => state.showWeekNumbers);
    const isMounted = useHasMounted();

    const weekdaysRaw = tCommon.raw('dates.weekdaysNarrow') as string[];
    const weekdays = rotateWeekdays(weekdaysRaw, weekStartsOn);

    // カレンダーの日付配列を生成
    const calendarDays = useMemo(() => {
      const monthStart = startOfMonth(viewMonth);
      const monthEnd = endOfMonth(viewMonth);
      const calendarStart = startOfWeek(monthStart, { weekStartsOn });
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

      return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    }, [viewMonth, weekStartsOn]);

    // 週ごとにグループ化
    const weeks = useMemo(() => {
      const result: Date[][] = [];
      for (let i = 0; i < calendarDays.length; i += 7) {
        result.push(calendarDays.slice(i, i + 7));
      }
      return result;
    }, [calendarDays]);

    // スワイプで月移動
    const handleSwipeLeft = useCallback(() => {
      onViewMonthChange(addMonths(viewMonth, 1));
    }, [viewMonth, onViewMonthChange]);

    const handleSwipeRight = useCallback(() => {
      onViewMonthChange(subMonths(viewMonth, 1));
    }, [viewMonth, onViewMonthChange]);

    const { handlers, ref } = useSwipeGesture(handleSwipeLeft, handleSwipeRight);

    // 日付の状態を判定
    const getDayState = useCallback(
      (date: Date) => {
        const today = new Date();
        const isToday = isSameDay(date, today);
        const isSelected = isSameDay(date, selectedDate);
        const isCurrentMonth = isSameMonth(date, viewMonth);

        return { isToday, isSelected, isCurrentMonth };
      },
      [selectedDate, viewMonth],
    );

    const handleDateClick = useCallback(
      (date: Date) => {
        onDateSelect(date);
      },
      [onDateSelect],
    );

    if (!isMounted) {
      return null;
    }

    const gridCols = showWeekNumbers ? 'grid-cols-[auto_repeat(7,1fr)]' : 'grid-cols-7';

    return (
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn('touch-pan-y px-2 pb-1 select-none', className)}
        {...handlers}
      >
        {/* 曜日ヘッダー */}
        <div className={cn('grid', gridCols)}>
          {showWeekNumbers && <div className="w-6" />}
          {weekdays.map((day) => (
            <div
              key={day}
              className="text-muted-foreground flex h-8 items-center justify-center text-xs font-normal"
            >
              {day}
            </div>
          ))}
        </div>

        {/* カレンダーグリッド */}
        <div className="grid gap-0">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className={cn('grid', gridCols)}>
              {showWeekNumbers && (
                <div className="text-muted-foreground flex h-11 w-6 items-center justify-center text-xs">
                  {week[0] !== undefined ? getWeek(week[0], { weekStartsOn }) : null}
                </div>
              )}
              {week.map((date) => {
                const { isToday, isSelected, isCurrentMonth } = getDayState(date);

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => handleDateClick(date)}
                    aria-label={format(date, 'yyyy-MM-dd')}
                    className={cn(
                      'flex h-11 items-center justify-center text-sm transition-colors',
                      !isCurrentMonth && 'text-muted-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-lg transition-colors',
                        !isToday && !isSelected && 'hover:bg-state-hover',
                        isToday && 'bg-primary text-primary-foreground font-medium',
                        isSelected && !isToday && 'bg-state-hover text-foreground',
                      )}
                    >
                      {format(date, 'd')}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  },
);

MobileMonthGrid.displayName = 'MobileMonthGrid';
