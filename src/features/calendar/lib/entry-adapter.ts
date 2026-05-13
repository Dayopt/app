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
 * Date の秒・ミリ秒を 0 にする（分単位以下の精度を切り捨て）
 *
 * TZ 変換や DB から読み出した秒以下のずれが、duration_minutes 計算 /
 * tzIsSameDay 判定にノイズを混ぜないようにする。
 *
 * 旧 `snapMinutes` は 15 分単位スナップも兼ねていたが、これは UI policy を
 * adapter に持ち込む形だった。Project A で 1 分粒度を許す方針になったため、
 * 責務を「秒以下の truncate」だけに分離する。
 *
 * @see docs/design/timeline-precision-redesign/overview.md § 4 A-3
 */
function truncateToMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

/**
 * EntryをCalendarEvent型に変換
 *
 * - status は時間位置から自動判定
 * - title が空の場合はカレンダー側で「(無題)」表示
 */
export function entryToCalendarEvent(entry: EntryWithTags, timezone: string): CalendarEvent | null {
  if (!entry.actual_start_time || !entry.actual_end_time) {
    return null;
  }

  const isUnplanned = entry.origin === 'unplanned';
  const isPlanned = entry.origin === 'planned';

  if (isPlanned && (!entry.start_time || !entry.end_time)) {
    return null;
  }

  const plannedStartDate = entry.start_time ? truncateToMinute(new Date(entry.start_time)) : null;
  const plannedEndDate = entry.end_time ? truncateToMinute(new Date(entry.end_time)) : null;
  const actualStartDate = truncateToMinute(new Date(entry.actual_start_time));
  const actualEndDate = truncateToMinute(new Date(entry.actual_end_time));

  // planned は予定位置、unplanned は実績位置をカレンダー上の表示位置に使う。
  const startDate = isUnplanned ? actualStartDate : plannedStartDate!;
  const endDate = isUnplanned ? actualEndDate : plannedEndDate!;

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
    actualStartDate,
    actualEndDate,
    plannedStartDate,
    plannedEndDate,
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
