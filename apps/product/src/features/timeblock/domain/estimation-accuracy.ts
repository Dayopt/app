/**
 * 見積もり精度（estimation accuracy）の pure transformation。
 *
 * Server 層 (`features/timeblock/server/statistics.ts`) の `getEstimationAccuracy`
 * から DB 行 → tRPC response shape の snake→camel 変換だけを切り出している。
 *
 * Review UI が消費する型 (`features/review/types/metrics.types.ts` の
 * `EstimationAccuracyData`) と構造的に互換だが、boundary rule により
 * review/domain への配置は不可。
 */

export interface EstimationAccuracyDbRow {
  tag_id: string | null;
  tag_name: string | null;
  tag_color: string | null;
  /** タグ削除等で `tag_id` が未分類バケットに畳まれた行かどうか */
  is_uncategorized: boolean;
  avg_planned_minutes: number;
  avg_actual_minutes: number;
  avg_deviation_minutes: number;
  record_count: number;
}

interface EstimationAccuracyItem {
  tagId: string | null;
  tagName: string | null;
  /** 未分類なら null。空文字の場合は 'indigo' にフォールバック */
  tagColor: string | null;
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
 * - `tag_color` が空文字なら `'indigo'` にフォールバック（未分類行は null のまま）
 */
export function transformEstimationAccuracy(
  rows: ReadonlyArray<EstimationAccuracyDbRow>,
): EstimationAccuracyItem[] {
  return rows.map((row) => ({
    tagId: row.tag_id,
    tagName: row.tag_name,
    tagColor: row.is_uncategorized ? null : row.tag_color || 'indigo',
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
 * `tag_id` が null の plan、および `tag_id` はあるが `tagsById` に存在しない
 * （タグ削除済み参照）plan は、どちらも単一の未分類バケット（`tag_id: null`）へ
 * 畳んで集計する。Time P/L の `buildTagPL`（`statistics-row-builders.ts`）と同じ扱い
 * （#1576: タグ削除時に Plan / Record を未分類化する仕様のため、見積もり精度からも
 * 除外しない）。
 *
 * 出力は `transformEstimationAccuracy` にそのまま渡せる DB-row 互換 shape。
 */

export interface EstimationAccuracyPlanRow {
  id: string;
  tag_id: string | null;
  planned_minutes: number;
}

export interface EstimationAccuracyRecordRow {
  plan_id: string | null;
  source: string;
  minutes: number;
}

export interface EstimationAccuracyTagLookup {
  name: string;
  color: string | null;
}

const AUTO_MIGRATED_SOURCE = 'auto_migrated';
/** 旧 `get_estimation_accuracy` RPC の `HAVING COUNT(*) >= 2` を踏襲。 */
const MIN_ENTRY_COUNT = 2;

export function aggregatePlanRecordEstimationAccuracy(
  plans: ReadonlyArray<EstimationAccuracyPlanRow>,
  records: ReadonlyArray<EstimationAccuracyRecordRow>,
  tagsById: ReadonlyMap<string, EstimationAccuracyTagLookup>,
): EstimationAccuracyDbRow[] {
  const actualMinutesByPlanId = new Map<string, number>();
  for (const record of records) {
    if (record.plan_id == null || record.source === AUTO_MIGRATED_SOURCE) continue;
    actualMinutesByPlanId.set(
      record.plan_id,
      (actualMinutesByPlanId.get(record.plan_id) ?? 0) + record.minutes,
    );
  }

  interface TagAccumulator {
    tagId: string | null;
    plannedSum: number;
    actualSum: number;
    deviationSum: number;
    count: number;
  }
  const byTag = new Map<string | null, TagAccumulator>();

  for (const plan of plans) {
    if (plan.planned_minutes <= 0) continue;
    const actualMinutes = actualMinutesByPlanId.get(plan.id);
    if (actualMinutes == null) continue;

    // tag_id はあるが tagsById に無い（削除済みタグ参照）場合も未分類バケットへ畳む
    const tagId = plan.tag_id != null && tagsById.has(plan.tag_id) ? plan.tag_id : null;

    const acc = byTag.get(tagId) ?? {
      tagId,
      plannedSum: 0,
      actualSum: 0,
      deviationSum: 0,
      count: 0,
    };
    acc.plannedSum += plan.planned_minutes;
    acc.actualSum += actualMinutes;
    acc.deviationSum += Math.abs(actualMinutes - plan.planned_minutes);
    acc.count += 1;
    byTag.set(tagId, acc);
  }

  return Array.from(byTag.values())
    .filter((acc) => acc.count >= MIN_ENTRY_COUNT)
    .sort((a, b) => b.count - a.count)
    .map((acc) => {
      const { tagId } = acc;
      const tag = tagId == null ? undefined : tagsById.get(tagId);
      const isUncategorized = tag == null;
      return {
        tag_id: isUncategorized ? null : tagId,
        tag_name: isUncategorized ? null : (tag?.name ?? ''),
        tag_color: isUncategorized ? null : (tag?.color ?? ''),
        is_uncategorized: isUncategorized,
        avg_planned_minutes: acc.plannedSum / acc.count,
        avg_actual_minutes: acc.actualSum / acc.count,
        avg_deviation_minutes: acc.deviationSum / acc.count,
        record_count: acc.count,
      };
    });
}
