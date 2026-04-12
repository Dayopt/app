/**
 * 日付フォーマットのカスタムフック
 * ユーザー設定に基づいて日付をフォーマットする
 */

import { useCallback } from 'react';

import { format } from 'date-fns';

import type { DateFormatType } from '@/stores/useCalendarSettingsStore';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

interface UseDateFormatReturn {
  dateFormat: DateFormatType;
  timeFormat: '12h' | '24h';
  timezone: string;
  /** 日付のみをフォーマット */
  formatDate: (date: Date) => string;
  /** 日付と時刻をフォーマット */
  formatDateTime: (date: Date) => string;
  /** 時刻のみをフォーマット */
  formatTime: (date: Date) => string;
}

/**
 * ユーザー設定に基づいて日付をフォーマットするフック
 */
export function useDateFormat(): UseDateFormatReturn {
  const dateFormat = useCalendarSettingsStore((s) => s.dateFormat);
  const timeFormat = useCalendarSettingsStore((s) => s.timeFormat);
  const timezone = useCalendarSettingsStore((s) => s.timezone);

  const formatDate = useCallback(
    (date: Date): string => {
      return format(date, dateFormat);
    },
    [dateFormat],
  );

  const formatDateTime = useCallback(
    (date: Date): string => {
      const timeFormatString = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';
      return format(date, `${dateFormat} ${timeFormatString}`);
    },
    [dateFormat, timeFormat],
  );

  const formatTime = useCallback(
    (date: Date): string => {
      const timeFormatString = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';
      return format(date, timeFormatString);
    },
    [timeFormat],
  );

  return {
    dateFormat,
    timeFormat,
    timezone,
    formatDate,
    formatDateTime,
    formatTime,
  };
}
