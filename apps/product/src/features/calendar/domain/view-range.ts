/**
 * 日付範囲計算エンジン — React/DOM依存ゼロの純粋関数
 *
 * ビューの日付範囲、ピリオド移動の計算を提供。
 */

import { addDays, addWeeks, eachDayOfInterval, endOfWeek, startOfWeek, subWeeks } from 'date-fns';

import { subDays } from '@/lib/date';

import type { CalendarViewType, ViewDateRange } from '../types/calendar.types';
import { getMultiDayCount, isMultiDayView } from '../types/calendar.types';

/**
 * ビューの日付範囲を計算
 * @param viewType - カレンダーのビュータイプ
 * @param currentDate - 現在表示中の日付
 * @param weekStartsOn - 週の開始日（0: 日曜日, 1: 月曜日, 6: 土曜日）
 */
export function calculateViewDateRange(
  viewType: CalendarViewType,
  currentDate: Date,
  weekStartsOn: 0 | 1 | 6 = 1,
  showWeekends = true,
): ViewDateRange {
  let start: Date, end: Date, days: Date[];

  if (isMultiDayView(viewType)) {
    const dayCount = getMultiDayCount(viewType);
    days = generateMultiDayDates(currentDate, dayCount, showWeekends);
    start = new Date(days[0] ?? currentDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(days[days.length - 1] ?? currentDate);
    end.setHours(23, 59, 59, 999);
  } else {
    switch (viewType) {
      case 'day':
        start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(currentDate);
        end.setHours(23, 59, 59, 999);
        days = [new Date(start)];
        break;

      case 'week':
        {
          const weekStart = startOfWeek(currentDate, { weekStartsOn });
          const weekEnd = endOfWeek(currentDate, { weekStartsOn });
          const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
          days = showWeekends
            ? weekDays
            : weekDays.filter((date) => date.getDay() !== 0 && date.getDay() !== 6);
          start = new Date(days[0] ?? weekStart);
          end = new Date(days[days.length - 1] ?? weekEnd);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
        }
        break;

      default:
        start = new Date(currentDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(currentDate);
        end.setHours(23, 59, 59, 999);
        days = [new Date(start)];
    }
  }

  return { start, end, days };
}

/**
 * 中央日を基準に N 日分を生成する。週末非表示では N 営業日を返すため、
 * 金曜付近の multi-day view でも実際の列と query 範囲がずれない。
 */
export function generateMultiDayDates(
  referenceDate: Date,
  count: number,
  showWeekends: boolean,
): Date[] {
  const offset = Math.floor(count / 2);

  if (!showWeekends) {
    let centerDate = referenceDate;
    while (centerDate.getDay() === 0 || centerDate.getDay() === 6) {
      centerDate = addDays(centerDate, 1);
    }

    const previousDates: Date[] = [];
    let candidate = subDays(centerDate, 1);
    while (previousDates.length < offset) {
      if (candidate.getDay() !== 0 && candidate.getDay() !== 6) {
        previousDates.unshift(candidate);
      }
      candidate = subDays(candidate, 1);
    }

    const nextDates: Date[] = [];
    candidate = addDays(centerDate, 1);
    while (nextDates.length < count - 1 - offset) {
      if (candidate.getDay() !== 0 && candidate.getDay() !== 6) {
        nextDates.push(candidate);
      }
      candidate = addDays(candidate, 1);
    }

    return [...previousDates, centerDate, ...nextDates];
  }

  return Array.from({ length: count }, (_, index) => {
    const dayOffset = index - offset;
    return dayOffset === 0 ? referenceDate : addDays(referenceDate, dayOffset);
  });
}

/**
 * 次の期間を取得
 */
export function getNextPeriod(viewType: CalendarViewType, currentDate: Date): Date {
  if (isMultiDayView(viewType)) {
    return addDays(currentDate, getMultiDayCount(viewType));
  }
  switch (viewType) {
    case 'day':
      return addDays(currentDate, 1);
    case 'week':
      return addWeeks(currentDate, 1);
    default:
      return addDays(currentDate, 1);
  }
}

/**
 * 前の期間を取得
 */
export function getPreviousPeriod(viewType: CalendarViewType, currentDate: Date): Date {
  if (isMultiDayView(viewType)) {
    return subDays(currentDate, getMultiDayCount(viewType));
  }
  switch (viewType) {
    case 'day':
      return subDays(currentDate, 1);
    case 'week':
      return subWeeks(currentDate, 1);
    default:
      return subDays(currentDate, 1);
  }
}
