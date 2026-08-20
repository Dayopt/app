/**
 * カレンダー固有のデータ変換ユーティリティ
 *
 * CalendarDisplayEvent のタイムゾーン適用を行う。
 */

import { convertToTimezone } from '@/lib/date/timezone';

import type { CalendarDisplayEvent } from '../types/calendar.types';

/**
 * CalendarDisplayEvent の displayStartDate/displayEndDate をユーザーTZに変換
 */
export function applyTimezoneToDisplayDates(
  plan: CalendarDisplayEvent,
  timezone: string,
): CalendarDisplayEvent {
  if (!plan.startDate) {
    return plan;
  }
  return {
    ...plan,
    displayStartDate: convertToTimezone(plan.startDate, timezone),
    displayEndDate: plan.endDate ? convertToTimezone(plan.endDate, timezone) : plan.displayEndDate,
  };
}
