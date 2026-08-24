/**
 * Record の物理テーブル `records` の行 -> `RecordEvent` 変換アダプター（read 側専用）
 *
 * `entry-adapter.ts`（entries -> CalendarDisplayEvent）と同じ配置パターンで、
 * 物理 `records` -> RecordEvent の境界射影を担う。
 */

import type { RecordEvent } from '@/features/timeblock';
import { convertToTimezone } from '@/lib/date/timezone';

/** Record の物理テーブル `records` のうち RecordEvent 射影に必要な最小 shape */
export interface RecordEventSourceRow {
  id: string;
  title: string;
  note: string | null;
  activity_id: string | null;
  plan_id: string | null;
  source: string;
  start_at: string;
  end_at: string;
}

/** TZ変換やDBから読み出した秒以下のずれが所要時間計算にノイズを混ぜないよう truncate する */
function truncateToMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

interface RecordRowToRecordEventOptions {
  timezone: string;
  /** 紐づく plan の所要時間（分）。`plan_id` が無い、または呼び出し側で未解決なら null/undefined */
  plannedMinutes?: number | null | undefined;
}

export function recordRowToRecordEvent(
  row: RecordEventSourceRow,
  options: RecordRowToRecordEventOptions,
): RecordEvent {
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
    activityId: row.activity_id,
    planId: row.plan_id,
    startDate,
    endDate,
    displayStartDate: convertToTimezone(startDate, options.timezone),
    displayEndDate: convertToTimezone(endDate, options.timezone),
    duration,
    diffMinutes,
  };
}

interface ExpandRecordRowsOptions {
  timezone: string;
  /** plan id -> 所要時間（分）。1 plan に複数 record が紐づく場合も同じ plan 時間を参照する */
  plannedMinutesByPlanId: ReadonlyMap<string, number>;
  /**
   * 差分を表示する代表 Record の候補。Calendar では現在の表示期間内にある Record を渡し、
   * 別日にある関連 Record も合計しつつ、表示中のカードへ差分を載せる。
   */
  primaryCandidateRecordIds?: ReadonlySet<string>;
}

/**
 * 1 plan に複数 record（分割記録）が紐づく 1:N ケースでは、各 record 個別の所要時間ではなく
 * 「その plan に紐づく record 群の合計実績時間」を予定時間と比較しないと差分が誤って
 * 二重・N 重に表示される（例: 60 分 plan を 30 分 record 2 件で記録した場合、
 * 個々の record 単位で `duration - plannedMinutes` を計算すると両方に `-30min` の
 * バッジが付くが、実際は合計 60 分で予定どおり）。
 *
 * そのため差分は「代表 record」1 件にのみ、合計実績時間ベースで付与し、他の record は
 * `diffMinutes` を持たない。表示候補が指定された場合はその中から選び、各候補群では
 * `source='from_plan'` を優先する。
 */
export function expandRecordRowsToRecordEvents(
  rows: ReadonlyArray<RecordEventSourceRow>,
  options: ExpandRecordRowsOptions,
): RecordEvent[] {
  // `recordRowToRecordEvent` が truncateToMinute 済みの `duration` を単一の情報源として使う
  // （ここで生の start_at/end_at から再計算すると truncate 前の秒数が混ざる）。
  const events = rows.map((row) =>
    recordRowToRecordEvent(row, { timezone: options.timezone, plannedMinutes: null }),
  );

  const totalActualMinutesByPlanId = new Map<string, number>();
  const rowsByPlanId = new Map<string, RecordEventSourceRow[]>();

  rows.forEach((row, i) => {
    if (row.plan_id == null) return;

    totalActualMinutesByPlanId.set(
      row.plan_id,
      (totalActualMinutesByPlanId.get(row.plan_id) ?? 0) + events[i]!.duration,
    );

    const group = rowsByPlanId.get(row.plan_id) ?? [];
    group.push(row);
    rowsByPlanId.set(row.plan_id, group);
  });

  const primaryRecordIdByPlanId = new Map<string, string>();
  for (const [planId, group] of rowsByPlanId) {
    const preferredGroup = options.primaryCandidateRecordIds
      ? group.filter((row) => options.primaryCandidateRecordIds?.has(row.id))
      : [];
    const candidates = preferredGroup.length > 0 ? preferredGroup : group;
    const primary = candidates.find((row) => row.source === 'from_plan') ?? candidates[0];
    if (primary) primaryRecordIdByPlanId.set(planId, primary.id);
  }

  return rows.map((row, i) => {
    const event = events[i]!;

    const isPrimary = row.plan_id != null && primaryRecordIdByPlanId.get(row.plan_id) === row.id;
    if (!isPrimary || row.plan_id == null) return event;

    const plannedMinutes = options.plannedMinutesByPlanId.get(row.plan_id);
    const totalActualMinutes = totalActualMinutesByPlanId.get(row.plan_id);
    if (plannedMinutes == null || totalActualMinutes == null) return event;

    return { ...event, diffMinutes: totalActualMinutes - plannedMinutes };
  });
}
