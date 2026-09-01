/**
 * 見積もり精度（estimation accuracy）の pure transformation。
 *
 * Server 層 (`features/timeblock/server/statistics.ts`) の `getEstimationAccuracy`
 * から DB 行 → tRPC response shape の snake→camel 変換だけを切り出している。
 *
 * Review UI が消費する型 (`features/review/types/metrics.types.ts` の
 * `EstimationAccuracyData`) と構造的に互換だが、boundary rule により
 * review/domain への配置は不可。
 *
 * 集計キーは tag_id から activity_id へ移行済み（tag-model-replacement Step 5
 * §3-C）。集計の意味論（未分類の畳み方・除外条件・n>=2 閾値）は tag 版から変更していない。
 */

export interface EstimationAccuracyDbRow {
  activity_id: string | null;
  activity_name: string | null;
  activity_color: string | null;
  /** アクティビティ削除等で `activity_id` が未分類バケットに畳まれた行かどうか */
  is_uncategorized: boolean;
  avg_planned_minutes: number;
  avg_actual_minutes: number;
  avg_deviation_minutes: number;
  record_count: number;
}

interface EstimationAccuracyItem {
  activityId: string | null;
  activityName: string | null;
  /** 未分類なら null。空文字の場合は 'indigo' にフォールバック */
  activityColor: string | null;
  isUncategorized: boolean;
  avgPlannedMinutes: number;
  avgActualMinutes: number;
  avgDeviationMinutes: number;
  recordCount: number;
}

/**
 * DB RPC 行配列を tRPC response 用に変換する。
 *
 * - snake_case → camelCase
 * - `activity_color` が空文字なら `'indigo'` にフォールバック（未分類行は null のまま）
 */
export function transformEstimationAccuracy(
  rows: ReadonlyArray<EstimationAccuracyDbRow>,
): EstimationAccuracyItem[] {
  return rows.map((row) => ({
    activityId: row.activity_id,
    activityName: row.activity_name,
    activityColor: row.is_uncategorized ? null : row.activity_color || 'indigo',
    isUncategorized: row.is_uncategorized,
    avgPlannedMinutes: row.avg_planned_minutes,
    avgActualMinutes: row.avg_actual_minutes,
    avgDeviationMinutes: row.avg_deviation_minutes,
    recordCount: row.record_count,
  }));
}

/**
 * Step 4: `plans` LEFT JOIN `records` (`plan_id` 経由) の 1:N 見積もり精度集計。
 *
 * 1 plan に複数 record が紐づく場合（分割記録）は record 時間を合算して 1 件の
 * 「実績」として扱う。`source = 'auto_migrated'` の record はユーザーが確定した記録
 * ではないため合算から除外する（overview.md §8 未決 4、Step 2 決定）。
 * 除外した結果、紐づく実績が 1 件も無い plan は estimation accuracy の分母から外れる
 * （旧 RPC の `actual_start_time/end_time IS NOT NULL` 条件と同じ効果）。
 *
 * `activity_id` が null の plan、および `activity_id` はあるが `activitiesById` に存在しない
 * （アクティビティ削除済み参照）plan は、どちらも単一の未分類バケット（`activity_id: null`）へ
 * 畳んで集計する。Time P/L の `buildActivityPL`（`statistics-activity-axis-builders.ts`）と
 * 同じ扱い（#1576: タグ削除時に Plan / Record を未分類化する仕様を activity 軸でも踏襲）。
 *
 * 出力は `transformEstimationAccuracy` にそのまま渡せる DB-row 互換 shape。
 */

export interface EstimationAccuracyPlanRow {
  id: string;
  activity_id: string | null;
  planned_minutes: number;
}

export interface EstimationAccuracyRecordRow {
  plan_id: string | null;
  source: string;
  minutes: number;
}

export interface EstimationAccuracyActivityLookup {
  name: string;
  /** アクティビティ自身は色を持たないため、所属カテゴリーから継承した色を渡す（#2162 §4-6） */
  color: string | null;
}

const AUTO_MIGRATED_SOURCE = 'auto_migrated';
/** 旧 `get_estimation_accuracy` RPC の `HAVING COUNT(*) >= 2` を踏襲。 */
const MIN_ENTRY_COUNT = 2;

export function aggregatePlanRecordEstimationAccuracy(
  plans: ReadonlyArray<EstimationAccuracyPlanRow>,
  records: ReadonlyArray<EstimationAccuracyRecordRow>,
  activitiesById: ReadonlyMap<string, EstimationAccuracyActivityLookup>,
): EstimationAccuracyDbRow[] {
  const actualMinutesByPlanId = new Map<string, number>();
  for (const record of records) {
    if (record.plan_id == null || record.source === AUTO_MIGRATED_SOURCE) continue;
    actualMinutesByPlanId.set(
      record.plan_id,
      (actualMinutesByPlanId.get(record.plan_id) ?? 0) + record.minutes,
    );
  }

  interface ActivityAccumulator {
    activityId: string | null;
    plannedSum: number;
    actualSum: number;
    deviationSum: number;
    count: number;
  }
  const byActivity = new Map<string | null, ActivityAccumulator>();

  for (const plan of plans) {
    if (plan.planned_minutes <= 0) continue;
    const actualMinutes = actualMinutesByPlanId.get(plan.id);
    if (actualMinutes == null) continue;

    // activity_id はあるが activitiesById に無い（削除済みアクティビティ参照）場合も
    // 未分類バケットへ畳む
    const activityId =
      plan.activity_id != null && activitiesById.has(plan.activity_id) ? plan.activity_id : null;

    const acc = byActivity.get(activityId) ?? {
      activityId,
      plannedSum: 0,
      actualSum: 0,
      deviationSum: 0,
      count: 0,
    };
    acc.plannedSum += plan.planned_minutes;
    acc.actualSum += actualMinutes;
    // 符号を保持する（実績 − 予定）。正なら超過、負なら早期完了。Math.abs で
    // 符号を潰すと、消費側（WeeklyReflectionPanel の deriveReflectionSignal）が
    // `avgDeviationMinutes > 0` で超過/早期完了の文言を出し分けられなくなる
    // （#2386: 早期完了side がほぼ到達しなくなっていた不具合）。
    acc.deviationSum += actualMinutes - plan.planned_minutes;
    acc.count += 1;
    byActivity.set(activityId, acc);
  }

  return Array.from(byActivity.values())
    .filter((acc) => acc.count >= MIN_ENTRY_COUNT)
    .sort((a, b) => b.count - a.count)
    .map((acc) => {
      const { activityId } = acc;
      const activity = activityId == null ? undefined : activitiesById.get(activityId);
      const isUncategorized = activity == null;
      return {
        activity_id: isUncategorized ? null : activityId,
        activity_name: isUncategorized ? null : (activity?.name ?? ''),
        activity_color: isUncategorized ? null : (activity?.color ?? ''),
        is_uncategorized: isUncategorized,
        avg_planned_minutes: acc.plannedSum / acc.count,
        avg_actual_minutes: acc.actualSum / acc.count,
        avg_deviation_minutes: acc.deviationSum / acc.count,
        record_count: acc.count,
      };
    });
}
