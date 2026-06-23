'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { DateRangeDisplayProps as BaseDateRangeDisplayProps } from '@/components/common/DateRangeDisplay';
import { DateRangeDisplay as DateRangeDisplayBase } from '@/components/common/DateRangeDisplay';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import { cn } from '@/lib/utils';

/** Calendar用 DateRangeDisplay のプロパティ */
interface CalendarDateRangeDisplayProps extends BaseDateRangeDisplayProps {
  viewType?: string | undefined;
  onDateSelect?: ((date: Date | undefined) => void) | undefined;
  clickable?: boolean | undefined;
  displayRange?:
    | {
        start: Date;
        end: Date;
      }
    | undefined;
}

/**
 * Calendar用 日付範囲表示
 *
 * 共通 DateRangeDisplay に MiniCalendar ポップアップ（モバイル）を追加。
 *
 * - モバイル（md未満）: クリックでMiniCalendarポップアップを表示
 * - PC（md以上）: 静的表示（サイドバーにMiniCalendarあり）
 */
export function DateRangeDisplay({
  date,
  endDate,
  showWeekNumber = false,
  weekStartsOn,
  formatPattern = 'MMMM yyyy',
  className,
  onDateSelect,
  clickable = false,
  displayRange,
}: CalendarDateRangeDisplayProps) {
  const tActions = useTranslations('calendar.actions');

  // クリック可能な場合: モバイル（ポップアップ）+ PC（静的）
  if (clickable && onDateSelect) {
    const dateContent = (
      <DateRangeDisplayBase
        date={date}
        endDate={endDate}
        weekStartsOn={weekStartsOn}
        formatPattern={formatPattern}
      />
    );

    return (
      <>
        {/* モバイル用: MiniCalendarポップアップ付き */}
        <MiniCalendar
          asPopover
          popoverTrigger={
            <button
              type="button"
              className={cn('flex items-center gap-1 md:hidden', className)}
              aria-label={tActions('openCalendar')}
            >
              {dateContent}
              <ChevronDown className="text-muted-foreground size-4" />
            </button>
          }
          selectedDate={date}
          displayRange={displayRange}
          onDateSelect={(selectedDate) => {
            if (selectedDate) {
              onDateSelect(selectedDate);
            }
          }}
          popoverAlign="start"
          popoverSide="bottom"
        />

        {/* PC用: 静的表示（週番号付き） */}
        <DateRangeDisplayBase
          date={date}
          endDate={endDate}
          showWeekNumber={showWeekNumber}
          weekStartsOn={weekStartsOn}
          formatPattern={formatPattern}
          className={cn('hidden md:flex', className)}
        />
      </>
    );
  }

  // クリック不可の場合: 静的表示のみ
  return (
    <DateRangeDisplayBase
      date={date}
      endDate={endDate}
      showWeekNumber={showWeekNumber}
      weekStartsOn={weekStartsOn}
      formatPattern={formatPattern}
      className={className}
    />
  );
}

export { CompactDateDisplay } from '@/components/common/DateRangeDisplay';
