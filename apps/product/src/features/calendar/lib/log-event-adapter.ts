/**
 * `logs` テーブル行 -> `LogEvent` 変換アダプター（Step 5、read 側専用）
 *
 * `entry-adapter.ts`（entries -> CalendarEvent）と同じ配置パターンで、
 * logs -> LogEvent の射影を担う。書き込み・DnD 保存先判定は Step 6。
 */

import type { LogEvent } from '@/features/entry';
import { convertToTimezone } from '@/lib/date/timezone';

/** `logs` テーブル行のうち LogEvent 射影に必要な最小 shape */
export interface LogEventSourceRow {
  id: string;
  title: string;
  note: string | null;
  tag_id: string | null;
  plan_id: string | null;
  start_at: string;
  end_at: string;
  fulfillment_score: number | null;
}

/** TZ変換やDBから読み出した秒以下のずれが所要時間計算にノイズを混ぜないよう truncate する */
function truncateToMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

export interface LogRowToLogEventOptions {
  timezone: string;
  /** 紐づく plan の所要時間（分）。`plan_id` が無い、または呼び出し側で未解決なら null/undefined */
  plannedMinutes?: number | null | undefined;
}

export function logRowToLogEvent(
  row: LogEventSourceRow,
  options: LogRowToLogEventOptions,
): LogEvent {
  const startDate = truncateToMinute(new Date(row.start_at));
  const endDate = truncateToMinute(new Date(row.end_at));
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  const diffMinutes =
    row.plan_id != null && options.plannedMinutes != null
      ? duration - options.plannedMinutes
      : undefined;

  return {
    id: row.id,
    title: row.title || '',
    note: row.note,
    tagId: row.tag_id,
    planId: row.plan_id,
    startDate,
    endDate,
    displayStartDate: convertToTimezone(startDate, options.timezone),
    displayEndDate: convertToTimezone(endDate, options.timezone),
    duration,
    fulfillmentScore: row.fulfillment_score,
    diffMinutes,
  };
}

export interface ExpandLogRowsOptions {
  timezone: string;
  /** plan id -> 所要時間（分）。1 plan に複数 log が紐づく場合も同じ plan 時間を毎回参照する */
  plannedMinutesByPlanId: ReadonlyMap<string, number>;
}

export function expandLogRowsToLogEvents(
  rows: ReadonlyArray<LogEventSourceRow>,
  options: ExpandLogRowsOptions,
): LogEvent[] {
  return rows.map((row) =>
    logRowToLogEvent(row, {
      timezone: options.timezone,
      plannedMinutes:
        row.plan_id != null ? (options.plannedMinutesByPlanId.get(row.plan_id) ?? null) : null,
    }),
  );
}
