/**
 * カレンダー固有のデータ変換ユーティリティ
 *
 * CalendarEvent のタイムゾーン適用を行う。
 */

import { convertToTimezone } from '@/lib/date/timezone';

import type { CalendarEvent } from '../types/calendar.types';

/**
 * CalendarEvent の displayStartDate/displayEndDate をユーザーTZに変換
 */
export function applyTimezoneToDisplayDates(plan: CalendarEvent, timezone: string): CalendarEvent {
  if (!plan.startDate) {
    return plan;
  }
  return {
    ...plan,
    displayStartDate: convertToTimezone(plan.startDate, timezone),
    displayEndDate: plan.endDate ? convertToTimezone(plan.endDate, timezone) : plan.displayEndDate,
  };
}
