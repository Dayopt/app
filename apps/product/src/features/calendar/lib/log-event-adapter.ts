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
  source: string;
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

interface LogRowToLogEventOptions {
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

interface ExpandLogRowsOptions {
  timezone: string;
  /** plan id -> 所要時間（分）。1 plan に複数 log が紐づく場合も同じ plan 時間を参照する */
  plannedMinutesByPlanId: ReadonlyMap<string, number>;
}

/**
 * 1 plan に複数 log（分割記録）が紐づく 1:N ケースでは、各 log 個別の所要時間ではなく
 * 「その plan に紐づく log 群の合計実績時間」を予定時間と比較しないと差分が誤って
 * 二重・N 重に表示される（例: 60 分 plan を 30 分 log 2 件で記録した場合、
 * 個々の log 単位で `duration - plannedMinutes` を計算すると両方に `-30min` の
 * バッジが付くが、実際は合計 60 分で予定どおり）。
 *
 * そのため差分は「代表 log」（`source='from_plan'` を優先、無ければ最初の log）
 * 1 件にのみ、合計実績時間ベースで付与し、他の log は `diffMinutes` を持たない。
 */
export function expandLogRowsToLogEvents(
  rows: ReadonlyArray<LogEventSourceRow>,
  options: ExpandLogRowsOptions,
): LogEvent[] {
  const totalActualMinutesByPlanId = new Map<string, number>();
  const primaryLogIdByPlanId = new Map<string, string>();

  for (const row of rows) {
    if (row.plan_id == null) continue;

    const duration = Math.round(
      (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) / 60000,
    );
    totalActualMinutesByPlanId.set(
      row.plan_id,
      (totalActualMinutesByPlanId.get(row.plan_id) ?? 0) + duration,
    );

    const currentPrimaryId = primaryLogIdByPlanId.get(row.plan_id);
    if (!currentPrimaryId || row.source === 'from_plan') {
      primaryLogIdByPlanId.set(row.plan_id, row.id);
    }
  }

  return rows.map((row) => {
    const event = logRowToLogEvent(row, { timezone: options.timezone, plannedMinutes: null });

    const isPrimary = row.plan_id != null && primaryLogIdByPlanId.get(row.plan_id) === row.id;
    if (!isPrimary || row.plan_id == null) return event;

    const plannedMinutes = options.plannedMinutesByPlanId.get(row.plan_id);
    const totalActualMinutes = totalActualMinutesByPlanId.get(row.plan_id);
    if (plannedMinutes == null || totalActualMinutes == null) return event;

    return { ...event, diffMinutes: totalActualMinutes - plannedMinutes };
  });
}
