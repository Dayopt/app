/**
 * 日付範囲計算エンジン — React/DOM依存ゼロの純粋関数
 *
 * ビューの日付範囲、ピリオド移動の計算を提供。
 */

import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  startOfWeek,
  subDays,
  subWeeks,
} from 'date-fns';

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
): ViewDateRange {
  let start: Date, end: Date, days: Date[];

  if (isMultiDayView(viewType)) {
    const dayCount = getMultiDayCount(viewType);
    const offset = Math.floor(dayCount / 2);
    start = subDays(currentDate, offset);
    start.setHours(0, 0, 0, 0);
    end = addDays(currentDate, dayCount - offset - 1);
    end.setHours(23, 59, 59, 999);
    days = eachDayOfInterval({ start, end });
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
        start = startOfWeek(currentDate, { weekStartsOn });
        end = endOfWeek(currentDate, { weekStartsOn });
        days = eachDayOfInterval({ start, end });
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
