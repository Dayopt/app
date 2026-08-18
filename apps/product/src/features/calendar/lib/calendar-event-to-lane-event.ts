/**
 * `CalendarEvent`（Step 8 の time model 射影）から TwoLane カード用の
 * `PlanEvent` / `RecordEvent` 表示型へ変換するアダプタ。
 *
 * `useCalendarData` は Plan / Record から CalendarEvent を作る際に kind/planId/recordSource を
 * 既に埋めているため、ここではCalendarが取得した関連イベント（`allEvents`）から
 * Plan の記録済み判定に必要な情報だけを逆引きする。Record の差分は
 * `useCalendarData` が 1 Plan : N Record を集約して代表 Record に事前計算する。
 */

import type { PlanEvent, PlanEventStatus, RecordEvent } from '@/features/timeblock';

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
  const isRecorded = allEvents.some((e) => e.kind === 'record' && e.planId === event.id);
  return {
    id: event.id,
    title: event.title,
    note: event.description ?? null,
    tagId: event.tagId ?? null,
    activityId: event.activityId ?? null,
    startDate: event.startDate ?? event.displayStartDate,
    endDate: event.endDate ?? event.displayEndDate,
    displayStartDate: event.displayStartDate,
    displayEndDate: event.displayEndDate,
    duration: event.duration,
    status: resolvePlanEventStatus(event, isRecorded, now),
  };
}

/** kind='record' の CalendarEvent を RecordLaneCard 用の RecordEvent へ変換する */
export function calendarEventToRecordEvent(event: CalendarEvent): RecordEvent {
  return {
    id: event.id,
    title: event.title,
    note: event.description ?? null,
    tagId: event.tagId ?? null,
    activityId: event.activityId ?? null,
    planId: event.planId ?? null,
    startDate: event.startDate ?? event.displayStartDate,
    endDate: event.endDate ?? event.displayEndDate,
    displayStartDate: event.displayStartDate,
    displayEndDate: event.displayEndDate,
    duration: event.duration,
    diffMinutes: event.diffMinutes,
  };
}
