import { Calendar, Clock } from 'lucide-react';

import { DateRow } from './DateRow';
import { TimeRow } from './TimeRow';

interface DateTimeSectionProps {
  /** 日付ラベル（例: `日付`） */
  dateLabel: string;
  /** 時間ラベル（例: `時間`） */
  timeLabel: string;
  selectedDate: Date;
  /** 日付が確定したときに呼ぶ。undefined は受け付けない */
  onDateSelect: (date: Date) => void;
  startTime: string;
  onStartChange: (time: string) => void;
  endTime: string;
  onEndChange: (time: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  isPrimary?: boolean;
  /** E2E 用の安定セレクタ。TimeRow の start/end に `*-start / *-end` を付与。 */
  testId?: string;
}

export function DateTimeSection({
  dateLabel,
  timeLabel,
  selectedDate,
  onDateSelect,
  startTime,
  onStartChange,
  endTime,
  onEndChange,
  disabled = false,
  hasError = false,
  isPrimary = false,
  testId,
}: DateTimeSectionProps) {
  return (
    <>
      <DateRow
        label={dateLabel}
        icon={Calendar}
        selectedDate={selectedDate}
        onDateChange={(next) => {
          if (next) onDateSelect(next);
        }}
        disabled={disabled}
      />
      <TimeRow
        label={timeLabel}
        icon={Clock}
        startTime={startTime}
        endTime={endTime}
        onStartChange={onStartChange}
        onEndChange={onEndChange}
        disabled={disabled}
        hasError={hasError}
        isPrimary={isPrimary}
        {...(testId ? { testId } : {})}
      />
    </>
  );
}
