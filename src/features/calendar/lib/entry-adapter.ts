/**
 * Entry -> CalendarEvent 変換アダプター
 *
 * entries テーブルのデータを
 * CalendarEvent（コア型）に変換して、カレンダービューに提供する。
 */

import type { EntryWithTags } from '@/features/entry';
import { getEntryState } from '@/features/entry';
import { tzIsSameDay } from '@/lib/date/timezone';
import type { CalendarEvent } from '../types/calendar.types';

/**
 * EntryをCalendarEvent型に変換
 *
 * - status は時間位置から自動判定
 * - title が空の場合はカレンダー側で「(無題)」表示
 */
export function entryToCalendarEvent(entry: EntryWithTags, timezone: string): CalendarEvent | null {
  if (!entry.start_time || !entry.end_time) {
    return null;
  }

  const startDate = new Date(entry.start_time);
  const endDate = new Date(entry.end_time);
  const createdAt = entry.created_at ? new Date(entry.created_at) : new Date();
  const updatedAt = entry.updated_at ? new Date(entry.updated_at) : new Date();
  const entryState = getEntryState(entry);

  // ユーザーTZで同日かどうかを判定（ブラウザローカルTZ依存を排除）
  const isMultiDay = !tzIsSameDay(startDate, endDate, timezone);

  const duration =
    entry.duration_minutes ?? Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  return {
    id: entry.id,
    title: entry.title || '',
    description: entry.description ?? undefined,
    startDate,
    endDate,
    status: entryState === 'past' ? 'closed' : 'open',
    color: '',
    reminder_minutes: entry.reminder_minutes,
    tagId: entry.tagId ?? null,
    createdAt,
    updatedAt,
    displayStartDate: startDate,
    displayEndDate: endDate,
    duration,
    isMultiDay,
    origin: entry.origin,
    entryState,
    fulfillmentScore: entry.fulfillment_score,
    actualStartDate: entry.actual_start_time ? new Date(entry.actual_start_time) : null,
    actualEndDate: entry.actual_end_time ? new Date(entry.actual_end_time) : null,
  };
}

/**
 * エントリをCalendarEvent配列に変換
 *
 * @param entries - エントリ配列（タグID付き）
 * @param timezone - ユーザーのタイムゾーン（マルチデイ判定に使用）
 * @returns CalendarEvent配列
 */
export function expandEntriesToCalendarEvents(
  entries: EntryWithTags[],
  timezone: string,
): CalendarEvent[] {
  return entries
    .map((entry) => entryToCalendarEvent(entry, timezone))
    .filter((event): event is CalendarEvent => event !== null);
}
