'use client';

import { cn } from '@/lib/utils';

import { DateDisplay } from './DateDisplay';
import type { DateDisplayRowProps } from './DateDisplay.types';

/** 複数日付を横一列に表示するコンポーネント */
export const DateDisplayRow = ({
  dates,
  className,
  selectedDate,
  showDayNames = true,
  showMonthYear = false,
  dayNameFormat = 'short',
  dateFormat = 'd',
  onDateClick,
  onDateDoubleClick,
}: DateDisplayRowProps) => {
  return (
    <div className={cn('flex', className)}>
      {dates.map((date, index) => (
        <DateDisplay
          key={date.toISOString()}
          date={date}
          className={cn(
            'flex-1',
            // 最後の日付以外は右ボーダーを表示
            index < dates.length - 1 && 'border-border border-r',
          )}
          isSelected={selectedDate ? date.toDateString() === selectedDate.toDateString() : false}
          showDayName={showDayNames}
          showMonthYear={showMonthYear}
          dayNameFormat={dayNameFormat}
          dateFormat={dateFormat}
          onClick={onDateClick}
          onDoubleClick={onDateDoubleClick}
        />
      ))}
    </div>
  );
};
