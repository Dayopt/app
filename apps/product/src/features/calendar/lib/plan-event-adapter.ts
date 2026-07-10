/**
 * `plans` テーブル行 -> `PlanEvent` 変換アダプター（Step 5、read 側専用）
 *
 * `entry-adapter.ts`（entries -> CalendarEvent）と同じ配置パターンで、
 * plans -> PlanEvent の射影を担う。書き込み・DnD 保存先判定は Step 6。
 */

import type { PlanEvent, PlanEventStatus } from '@/features/entry';
import { convertToTimezone } from '@/lib/date/timezone';

/** `plans` テーブル行のうち PlanEvent 射影に必要な最小 shape */
export interface PlanEventSourceRow {
  id: string;
  title: string;
  note: string | null;
  tag_id: string | null;
  start_at: string;
  end_at: string;
  skipped_at: string | null;
}

/** TZ変換やDBから読み出した秒以下のずれが所要時間計算にノイズを混ぜないよう truncate する */
function truncateToMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

/**
 * overview.md §4「過去 Plan の見え方」に基づく status 判定。
 *
 * 優先順位: skip > 記録済み > 時間位置（unrecorded/active/upcoming）
 */
function resolvePlanEventStatus({
  skippedAt,
  startDate,
  endDate,
  isRecorded,
  now,
}: {
  skippedAt: string | null;
  startDate: Date;
  endDate: Date;
  isRecorded: boolean;
  now: Date;
}): PlanEventStatus {
  if (skippedAt != null) return 'skipped';
  if (isRecorded) return 'recorded';
  if (endDate.getTime() <= now.getTime()) return 'unrecorded';
  if (startDate.getTime() <= now.getTime()) return 'active';
  return 'upcoming';
}

export interface PlanRowToPlanEventOptions {
  timezone: string;
  /** この plan を参照する log（`source <> 'auto_migrated'` を問わず）が 1 件以上あるか */
  isRecorded: boolean;
  /** テスト用の時刻固定。省略時は `new Date()` */
  now?: Date;
}

export function planRowToPlanEvent(
  row: PlanEventSourceRow,
  options: PlanRowToPlanEventOptions,
): PlanEvent {
  const startDate = truncateToMinute(new Date(row.start_at));
  const endDate = truncateToMinute(new Date(row.end_at));
  const now = options.now ?? new Date();
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  return {
    id: row.id,
    title: row.title || '',
    note: row.note,
    tagId: row.tag_id,
    startDate,
    endDate,
    displayStartDate: convertToTimezone(startDate, options.timezone),
    displayEndDate: convertToTimezone(endDate, options.timezone),
    duration,
    status: resolvePlanEventStatus({
      skippedAt: row.skipped_at,
      startDate,
      endDate,
      isRecorded: options.isRecorded,
      now,
    }),
  };
}

export interface ExpandPlanRowsOptions {
  timezone: string;
  /** log から紐づけられている plan id の集合（1 件以上参照されていれば記録済み扱い） */
  recordedPlanIds: ReadonlySet<string>;
  now?: Date;
}

export function expandPlanRowsToPlanEvents(
  rows: ReadonlyArray<PlanEventSourceRow>,
  options: ExpandPlanRowsOptions,
): PlanEvent[] {
  return rows.map((row) =>
    planRowToPlanEvent(row, {
      timezone: options.timezone,
      isRecorded: options.recordedPlanIds.has(row.id),
      ...(options.now !== undefined && { now: options.now }),
    }),
  );
}
