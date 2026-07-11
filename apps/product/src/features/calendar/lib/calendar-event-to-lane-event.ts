/**
 * `CalendarEvent`（Step 8 の time model 射影）から TwoLane カード用の
 * `PlanEvent` / `LogEvent` 表示型へ変換するアダプタ。
 *
 * `useCalendarData` は plans/logs から CalendarEvent を作る際に kind/planId/logSource を
 * 既に埋めているため、ここでは同じ視野内の他イベント（`allEvents`）から
 * 記録済み判定・差分計算に必要な情報だけを逆引きする。
 */

import type { LogEvent, PlanEvent, PlanEventStatus } from '@/features/entry';

import type { CalendarEvent } from '../types/calendar.types';

function resolvePlanEventStatus(
  event: CalendarEvent,
  isRecorded: boolean,
  now: Date,
): PlanEventStatus {
  if (event.isSkipped) return 'skipped';
  if (isRecorded) return 'recorded';
  const endDate = event.endDate ?? event.displayEndDate;
  const startDate = event.startDate ?? event.displayStartDate;
  if (endDate && endDate.getTime() <= now.getTime()) return 'unrecorded';
  if (startDate && startDate.getTime() <= now.getTime()) return 'active';
  return 'upcoming';
}

/** kind='plan' の CalendarEvent を PlanLaneCard 用の PlanEvent へ変換する */
export function calendarEventToPlanEvent(
  event: CalendarEvent,
  allEvents: ReadonlyArray<CalendarEvent>,
  now: Date = new Date(),
): PlanEvent {
  const isRecorded = allEvents.some((e) => e.kind === 'log' && e.planId === event.id);
  return {
    id: event.id,
    title: event.title,
    note: event.description ?? null,
    tagId: event.tagId ?? null,
    startDate: event.startDate ?? event.displayStartDate,
    endDate: event.endDate ?? event.displayEndDate,
    displayStartDate: event.displayStartDate,
    displayEndDate: event.displayEndDate,
    duration: event.duration,
    status: resolvePlanEventStatus(event, isRecorded, now),
  };
}

/** kind='log' の CalendarEvent を LogLaneCard 用の LogEvent へ変換する */
export function calendarEventToLogEvent(
  event: CalendarEvent,
  allEvents: ReadonlyArray<CalendarEvent>,
): LogEvent {
  const plan =
    event.planId != null
      ? allEvents.find((e) => e.kind === 'plan' && e.id === event.planId)
      : undefined;
  const diffMinutes = plan ? event.duration - plan.duration : undefined;

  return {
    id: event.id,
    title: event.title,
    note: event.description ?? null,
    tagId: event.tagId ?? null,
    planId: event.planId ?? null,
    startDate: event.startDate ?? event.displayStartDate,
    endDate: event.endDate ?? event.displayEndDate,
    displayStartDate: event.displayStartDate,
    displayEndDate: event.displayEndDate,
    duration: event.duration,
    fulfillmentScore: null,
    diffMinutes,
  };
}
