'use client';

import {
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';

import { isTodayInTimezone, tzIsSameDay } from '@/lib/date/timezone';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { cn } from '@dayopt/components';

import { useSwipeGesture } from '@/lib/hooks/useSwipeGesture';

/** 週の開始日に応じた曜日配列を回転 */
function rotateWeekdays(weekdaysNarrow: string[], weekStartsOn: 0 | 1 | 6): string[] {
  return [...weekdaysNarrow.slice(weekStartsOn), ...weekdaysNarrow.slice(0, weekStartsOn)];
}

interface MobileMonthGridProps {
  viewMonth: Date;
  selectedDate: Date;
  /**
   * 見ている範囲（両端を含む）。渡すと帯で塗る。
   *
   * 1 日より広い単位を見ている面（レポートの週 / 月 / 年、カレンダーの複数日ビュー）で、
   * `selectedDate` の 1 マスだけが光ると「その日だけの数字」と読み違える。
   */
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
  ({ viewMonth, selectedDate, displayRange, onViewMonthChange, onDateSelect, className }) => {
    const tCommon = useTranslations('common');
    const weekStartsOn = useUserPreferences((state) => state.weekStartsOn);
    const showWeekNumbers = useUserPreferences((state) => state.showWeekNumbers);
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

    const timezone = useUserPreferences((state) => state.timezone);

    // 日付の状態を判定（ユーザー TZ ベース）
    const getDayState = useCallback(
      (date: Date) => {
        const isToday = isTodayInTimezone(date, timezone);
        const isSelected = tzIsSameDay(date, selectedDate, timezone);
        const isCurrentMonth = isSameMonth(date, viewMonth);
        // 帯は端だけ角を丸める。中はつなげて 1 本に見せる
        const isInRange =
          displayRange !== undefined &&
          isWithinInterval(date, {
            start: startOfDay(displayRange.start),
            end: endOfDay(displayRange.end),
          });
        // 端の判定は所属判定（`isWithinInterval` = device local）と同じ基準にする。
        // `tzIsSameDay` を混ぜると、端末の TZ とユーザーの TZ が違う時に端だけ一致せず、
        // 帯の角丸が片側だけ落ちる
        const isRangeStart = isInRange && isSameDay(date, displayRange.start);
        const isRangeEnd = isInRange && isSameDay(date, displayRange.end);

        return { isToday, isSelected, isCurrentMonth, isInRange, isRangeStart, isRangeEnd };
      },
      [selectedDate, viewMonth, timezone, displayRange],
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
                const { isToday, isSelected, isCurrentMonth, isInRange, isRangeStart, isRangeEnd } =
                  getDayState(date);

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => handleDateClick(date)}
                    aria-label={format(date, 'yyyy-MM-dd')}
                    // 「今日」「選択中」は背景色でしか出していないので、読み上げにも
                    // 同じ情報を渡す（MobileYearStrip と同じ扱い）
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex h-11 items-center justify-center text-sm transition-colors',
                      !isCurrentMonth && 'text-muted-foreground',
                      isInRange && 'bg-state-selected',
                      isRangeStart && 'rounded-l-lg',
                      isRangeEnd && 'rounded-r-lg',
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
