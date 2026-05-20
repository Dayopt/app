/**
 * イベントソートユーティリティ
 * 全ビューで共通使用される重複ソート処理をまとめる
 */

import type { CalendarEvent } from '../../../../types/calendar.types';

/** イベントを開始時刻順でソート（WeekView / MultiDayViewで使用） */
export function sortEventsByTime(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aTime = a.startDate ? a.startDate.getTime() : 0;
    const bTime = b.startDate ? b.startDate.getTime() : 0;
    return aTime - bTime;
  });
}

/** 日付キー別イベントマップをそれぞれ時刻順でソート */
export function sortEventsByDateKeys(
  eventsByDate: Record<string, CalendarEvent[]>,
): Record<string, CalendarEvent[]> {
  const sorted = { ...eventsByDate };

  Object.keys(sorted).forEach((dateKey) => {
    sorted[dateKey] = sortEventsByTime(sorted[dateKey]!);
  });

  return sorted;
}

/** AgendaView用のイベントソート（時刻順） */
export function sortEventsForAgenda(events: CalendarEvent[]): CalendarEvent[] {
  return sortEventsByTime(events);
}

/** 日付キー別イベントマップをAgendaView用にソート */
export function sortAgendaEventsByDateKeys(
  eventsByDate: Record<string, CalendarEvent[]>,
): Record<string, CalendarEvent[]> {
  const sorted = { ...eventsByDate };

  Object.keys(sorted).forEach((dateKey) => {
    sorted[dateKey] = sortEventsForAgenda(sorted[dateKey]!);
  });

  return sorted;
}
