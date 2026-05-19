'use client';

import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { memo, useCallback, useMemo, useState } from 'react';

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getMonth,
  getWeek,
  getYear,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/lib/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/lib/components/ui/select';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import { cn } from '@/lib/utils';

export interface MiniCalendarProps {
  selectedDate?: Date | undefined;
  onDateSelect?: ((date: Date | undefined) => void) | undefined;
  onMonthChange?: ((date: Date) => void) | undefined;
  className?: string | undefined;
  month?: Date | undefined;
  asPopover?: boolean | undefined;
  popoverTrigger?: React.ReactNode | undefined;
  popoverClassName?: string | undefined;
  popoverAlign?: 'start' | 'center' | 'end' | undefined;
  popoverSide?: 'top' | 'right' | 'bottom' | 'left' | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** 「日付なし」ボタンを表示するか */
  allowClear?: boolean | undefined;
  /** Popover の z-index クラス名（Inspector内では高い値を使用） */
  popoverZIndex?: string | undefined;
  /** 表示期間のハイライト範囲（WeekViewなどで現在表示中の期間をハイライト） */
  displayRange?: { start: Date; end: Date } | undefined;
  /** 選択可能な最小日付（これより前の日付はグレーアウトして選択不可） */
  minDate?: Date | undefined;
}

// 週の開始日に応じた曜日配列を取得する関数
function rotateWeekdays(weekdaysNarrow: string[], weekStartsOn: 0 | 1 | 6): string[] {
  // weekStartsOnに応じて配列を回転
  // 0: 日曜始まり → そのまま
  // 1: 月曜始まり → 月火水木金土日
  // 6: 土曜始まり → 土日月火水木金
  return [...weekdaysNarrow.slice(weekStartsOn), ...weekdaysNarrow.slice(0, weekStartsOn)];
}

const START_YEAR = 2020;
const END_YEAR = 2050;

/**
 * MiniCalendar - 自作カレンダーコンポーネント
 *
 * shadcn/ui Calendarのデザインを参考に実装
 * - date-fnsベースの軽量実装
 * - セマンティックトークン完全対応
 * - 8pxグリッド準拠（セルサイズ32px）
 * - 日本語/英語対応
 * - 週範囲ハイライト対応
 */
export const MiniCalendar = memo<MiniCalendarProps>(
  ({
    selectedDate,
    onDateSelect,
    onMonthChange,
    className,
    month,
    asPopover = false,
    popoverTrigger,
    popoverClassName,
    popoverAlign = 'start',
    popoverSide = 'bottom',
    onOpenChange,
    allowClear = false,
    popoverZIndex,
    displayRange: _displayRange,
    minDate,
  }) => {
    const tCommon = useTranslations('common');
    const tActions = useTranslations('calendar.actions');
    const weekStartsOn = useCalendarSettingsStore((state) => state.weekStartsOn);
    const showWeekNumbers = useCalendarSettingsStore((state) => state.showWeekNumbers);
    const isMounted = useHasMounted();
    const [open, setOpen] = useState(false);
    const [viewMonth, setViewMonth] = useState(() => month ?? selectedDate ?? new Date());

    // 外部からmonth/selectedDateが変更された場合に同期（React推奨: レンダー中のstate調整）
    // 注意: Date はオブジェクト参照なので !== ではなく isSameDay で比較する。
    // 親が新しい Date インスタンスを渡すと参照比較で無限ループになるため。
    const [prevMonth, setPrevMonth] = useState(month);
    const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);
    const monthChanged = month ? !prevMonth || !isSameDay(month, prevMonth) : month !== prevMonth;
    const selectedDateChanged = selectedDate
      ? !prevSelectedDate || !isSameDay(selectedDate, prevSelectedDate)
      : selectedDate !== prevSelectedDate;
    if (month && monthChanged) {
      setPrevMonth(month);
      setViewMonth(month);
    } else if (monthChanged) {
      setPrevMonth(month);
    }
    if (selectedDate && selectedDateChanged) {
      setPrevSelectedDate(selectedDate);
      setViewMonth(selectedDate);
    } else if (selectedDateChanged) {
      setPrevSelectedDate(selectedDate);
    }

    const weekdaysRaw = tCommon.raw('dates.weekdaysNarrow') as string[];
    const monthsRaw = tCommon.raw('dates.monthsShort') as string[];
    const weekdays = rotateWeekdays(weekdaysRaw, weekStartsOn);
    const months = monthsRaw;

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

    // 年の選択肢を生成
    const years = useMemo(() => {
      const result: number[] = [];
      for (let year = START_YEAR; year <= END_YEAR; year++) {
        result.push(year);
      }
      return result;
    }, []);

    const handlePrevMonth = useCallback(() => {
      const newMonth = subMonths(viewMonth, 1);
      setViewMonth(newMonth);
      onMonthChange?.(newMonth);
    }, [viewMonth, onMonthChange]);

    const handleNextMonth = useCallback(() => {
      const newMonth = addMonths(viewMonth, 1);
      setViewMonth(newMonth);
      onMonthChange?.(newMonth);
    }, [viewMonth, onMonthChange]);

    const handleMonthSelect = useCallback(
      (monthIndex: string) => {
        const newMonth = new Date(getYear(viewMonth), parseInt(monthIndex, 10), 1);
        setViewMonth(newMonth);
        onMonthChange?.(newMonth);
      },
      [viewMonth, onMonthChange],
    );

    const handleYearSelect = useCallback(
      (year: string) => {
        const newMonth = new Date(parseInt(year, 10), getMonth(viewMonth), 1);
        setViewMonth(newMonth);
        onMonthChange?.(newMonth);
      },
      [viewMonth, onMonthChange],
    );

    const handleDateClick = useCallback(
      (date: Date) => {
        onDateSelect?.(date);
        if (asPopover) {
          setOpen(false);
        }
      },
      [onDateSelect, asPopover],
    );

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setOpen(newOpen);
        onOpenChange?.(newOpen);
      },
      [onOpenChange],
    );

    const handleClearDate = useCallback(() => {
      onDateSelect?.(undefined);
      if (asPopover) {
        setOpen(false);
      }
    }, [onDateSelect, asPopover]);

    // 日付の状態を判定
    const getDayState = useCallback(
      (date: Date) => {
        const today = new Date();
        const isToday = isSameDay(date, today);
        const isSelected = selectedDate && isSameDay(date, selectedDate);
        const isCurrentMonth = isSameMonth(date, viewMonth);
        const isDisabled = minDate ? isBefore(startOfDay(date), startOfDay(minDate)) : false;

        return { isToday, isSelected, isCurrentMonth, isDisabled };
      },
      [selectedDate, viewMonth, minDate],
    );

    // ハイドレーション対策
    if (!isMounted) {
      return null;
    }

    const gridCols = showWeekNumbers ? 'grid-cols-[auto_repeat(7,1fr)]' : 'grid-cols-7';

    const renderCalendar = () => (
      <div className={cn('p-2 select-none', className)}>
        {/* ヘッダー: ナビゲーション + 月・年選択 */}
        <div className="mb-2 flex items-center justify-between">
          {/* 前月ボタン */}
          <Button
            variant="ghost"
            size="sm"
            icon
            className="text-muted-foreground hover:bg-state-hover hover:text-foreground rounded-lg"
            onClick={handlePrevMonth}
            aria-label={tActions('previousMonth')}
          >
            <ChevronLeft className="size-4" />
          </Button>

          {/* 月・年ドロップダウン - 中央 */}
          <div className="flex items-center gap-1">
            <Select value={getMonth(viewMonth).toString()} onValueChange={handleMonthSelect}>
              <SelectTrigger
                size="sm"
                className="border-border hover:bg-state-hover focus-visible:ring-ring h-7 gap-1 bg-transparent px-2 text-sm font-normal shadow-none focus-visible:ring-2"
                aria-label={tActions('selectMonth')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((monthName, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {monthName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={getYear(viewMonth).toString()} onValueChange={handleYearSelect}>
              <SelectTrigger
                size="sm"
                className="border-border hover:bg-state-hover focus-visible:ring-ring h-7 gap-1 bg-transparent px-2 text-sm font-normal shadow-none focus-visible:ring-2"
                aria-label={tActions('selectYear')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 次月ボタン */}
          <Button
            variant="ghost"
            size="sm"
            icon
            className="text-muted-foreground hover:bg-state-hover hover:text-foreground rounded-lg"
            onClick={handleNextMonth}
            aria-label={tActions('nextMonth')}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* 曜日ヘッダー */}
        <div className={cn('mb-1 grid', gridCols)}>
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
                <div className="text-muted-foreground flex h-8 w-6 items-center justify-center text-xs">
                  {week[0] !== undefined ? getWeek(week[0], { weekStartsOn }) : null}
                </div>
              )}
              {week.map((date) => {
                const { isToday, isSelected, isCurrentMonth, isDisabled } = getDayState(date);

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => !isDisabled && handleDateClick(date)}
                    disabled={isDisabled}
                    aria-label={format(date, 'yyyy-MM-dd')}
                    className={cn(
                      // ベーススタイル - セルは h-8、ハイライトは内側 span で制御
                      'flex h-8 items-center justify-center text-sm transition-colors',
                      // 無効化（minDateより前）
                      isDisabled && 'pointer-events-none opacity-30',
                      // 現在の月以外は薄く
                      !isCurrentMonth && !isDisabled && 'text-muted-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-lg transition-colors',
                        // ホバー（今日以外）
                        !isToday && !isDisabled && 'hover:bg-state-hover',
                        // 今日: primary
                        isToday && !isDisabled && 'bg-primary text-primary-foreground font-medium',
                        // 選択中（今日以外）
                        isSelected && !isToday && !isDisabled && 'bg-state-hover text-foreground',
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

        {/* 日付なしボタン（全幅ボーダー用に外側） */}
        {allowClear && (
          <div className="border-border-subtle border-t">
            <div className="px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground w-full"
                onClick={handleClearDate}
              >
                {tCommon('datePicker.noDate')}
              </Button>
            </div>
          </div>
        )}
      </div>
    );

    // Popoverモード
    if (asPopover) {
      return (
        <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
          <PopoverTrigger asChild>{popoverTrigger}</PopoverTrigger>
          <PopoverContent
            className={cn(
              'bg-card border-border-subtle w-auto border p-0 shadow-sm',
              popoverClassName,
              popoverZIndex,
            )}
            align={popoverAlign}
            side={popoverSide}
          >
            {renderCalendar()}
          </PopoverContent>
        </Popover>
      );
    }

    // 直接表示モード
    return renderCalendar();
  },
);

MiniCalendar.displayName = 'MiniCalendar';
