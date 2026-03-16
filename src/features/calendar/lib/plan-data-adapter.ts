/**
 * カレンダー固有のデータ変換ユーティリティ
 *
 * CalendarEvent のタイムゾーン適用やイベントタイプ判定を行う。
 */

import { convertToTimezone } from '@/lib/date/timezone';

import type { CalendarEvent } from '../types/calendar.types';

/**
 * CalendarEvent の displayStartDate/displayEndDate をユーザーTZに変換
 * Records は変換しない（壁時計時刻のため）
 */
export function applyTimezoneToDisplayDates(plan: CalendarEvent, timezone: string): CalendarEvent {
  if (plan.origin === 'unplanned' || !plan.startDate) {
    return plan;
  }
  return {
    ...plan,
    displayStartDate: convertToTimezone(plan.startDate, timezone),
    displayEndDate: plan.endDate ? convertToTimezone(plan.endDate, timezone) : plan.displayEndDate,
  };
}

/**
 * CalendarEventが記録（unplanned）かどうかを判定
 */
export function isRecordEvent(event: Pick<CalendarEvent, 'origin'> | null | undefined): boolean {
  if (!event) return false;
  return event.origin === 'unplanned';
}

/**
 * CalendarEventの起源を取得
 */
export function getEventOrigin(
  event: Pick<CalendarEvent, 'origin'> | null | undefined,
): 'planned' | 'unplanned' {
  return isRecordEvent(event) ? 'unplanned' : 'planned';
}
