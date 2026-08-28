import 'server-only';

/**
 * 3 構造モデル（#2162）の集計ビルダー。
 *
 * 取得済み rows から画面向けの集計行を組み立てる。DB 非依存。
 * 足し算そのものは `domain/activity-axis-aggregation.ts` の純関数が持ち、
 * ここは snake_case の行を domain の入力へ均し、名前・色を載せて返すだけに留める
 * （AGENTS.md / `pr-cross-review` skill の「RPC / DB response transformer は server」）。
 *
 * 並び順は actualMinutes の降順にする。`activities.sort_order` を並びの根拠に使わないのは、
 * 分析軸の並びが「量の大きい順」であるべきで、サイドバーの並び順とは別の関心だから。
 * これにより sort_order の有無に依存しない。
 */

import {
  aggregateByActivity,
  aggregateByCategory,
  aggregateBySegment,
  type ActivityAxisDurationRow,
} from '../domain/activity-axis-aggregation';

import { minutesBetween } from './statistics-service-grouping';

/** 集計対象の Plan 行。`activity_id` は未設定なら null。 */
export interface AxisPlanRow {
  id: string;
  activity_id: string | null;
  start_at: string;
  end_at: string;
}

/** 集計対象の Record 行。 */
export interface AxisRecordRow {
  id: string;
  activity_id: string | null;
  plan_id: string | null;
  start_at: string;
  end_at: string;
}

export interface ActivityLookupRow {
  id: string;
  name: string;
  /** カテゴリー未所属は null */
  category_id: string | null;
}

export interface CategoryLookupRow {
  id: string;
  name: string;
  /** 実 schema では nullable。色なしのカテゴリーがありうる */
  color: string | null;
  icon: string | null;
}

interface ActivityPLRow {
  /** null は「アクティビティなし」 */
  activityId: string | null;
  activityName: string | null;
  categoryId: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  budgetMinutes: number;
  actualMinutes: number;
  isPlanned: boolean;
  isNoActivity: boolean;
}

interface CategoryPLRow {
  /** null は「未分類」 */
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  budgetMinutes: number;
  actualMinutes: number;
  isPlanned: boolean;
  isUncategorized: boolean;
}

/**
 * セグメント軸の 1 行。
 *
 * 意図的に合計・比率を持たない。セグメントは重複しうるので合計に意味が無く、
 * 比率を出せる形にすると円グラフ・積み上げ棒・「合計 100%」が書けてしまう。
 */
interface SegmentTotalRow {
  segmentId: string;
  segmentName: string;
  budgetMinutes: number;
  actualMinutes: number;
}

function toDurationRows(
  rows: ReadonlyArray<AxisPlanRow | AxisRecordRow>,
  knownActivityIds: ReadonlySet<string>,
): ActivityAxisDurationRow[] {
  return rows.map((row) => ({
    // 未知（削除済み）の activity_id は null へ均す。落とすと総和が合わなくなる
    activityId:
      row.activity_id != null && knownActivityIds.has(row.activity_id) ? row.activity_id : null,
    minutes: minutesBetween(row.start_at, row.end_at),
  }));
}

export function buildActivityPL(
  plans: ReadonlyArray<AxisPlanRow>,
  records: ReadonlyArray<AxisRecordRow>,
  activitiesById: ReadonlyMap<string, ActivityLookupRow>,
  categoriesById: ReadonlyMap<string, CategoryLookupRow>,
): ActivityPLRow[] {
  const knownActivityIds = new Set(activitiesById.keys());
  const aggregates = aggregateByActivity(
    toDurationRows(plans, knownActivityIds),
    toDurationRows(records, knownActivityIds),
  );

  return aggregates
    .filter((a) => a.plannedMinutes > 0 || a.recordedMinutes > 0)
    .map((a) => {
      const activity = a.activityId == null ? undefined : activitiesById.get(a.activityId);
      const category =
        activity?.category_id == null ? undefined : categoriesById.get(activity.category_id);
      return {
        activityId: a.activityId,
        activityName: activity?.name ?? null,
        categoryId: activity?.category_id ?? null,
        // 旧 buildTagPL は色未設定を server 側で 'indigo' へ既定していたが、ここでは
        // null をそのまま返す（意図的な変更、#2204 クロスレビュー P3-5）。categories.color は
        // 実 schema で nullable なので、既定色への解決は consumer 側の resolveTagColor に
        // 統一する（useTimePLData / MCP 双方が同じ関数を通るようにするため）。
        categoryColor: category?.color ?? null,
        categoryIcon: category?.icon ?? null,
        budgetMinutes: a.plannedMinutes,
        actualMinutes: a.recordedMinutes,
        isPlanned: a.hasPlan,
        isNoActivity: a.activityId == null,
      };
    })
    .sort((x, y) => y.actualMinutes - x.actualMinutes);
}

// buildCategoryPL / buildSegmentTotals は本 PR 時点では consumer が無い。
// #2181（/report ページ）の実装レーンが配線する想定で意図的に export したまま
// 置いている（knip / CI Static Checks は本 PR head で clean と実測確認済み）。
export function buildCategoryPL(
  plans: ReadonlyArray<AxisPlanRow>,
  records: ReadonlyArray<AxisRecordRow>,
  activitiesById: ReadonlyMap<string, ActivityLookupRow>,
  categoriesById: ReadonlyMap<string, CategoryLookupRow>,
): CategoryPLRow[] {
  const knownActivityIds = new Set(activitiesById.keys());
  const categoryIdByActivityId = new Map<string, string | null>(
    Array.from(activitiesById.values()).map((a) => [
      a.id,
      // 未知カテゴリー参照も未分類へ倒す
      a.category_id != null && categoriesById.has(a.category_id) ? a.category_id : null,
    ]),
  );

  const aggregates = aggregateByCategory(
    toDurationRows(plans, knownActivityIds),
    toDurationRows(records, knownActivityIds),
    categoryIdByActivityId,
  );

  return aggregates
    .filter((a) => a.plannedMinutes > 0 || a.recordedMinutes > 0)
    .map((a) => {
      const category = a.categoryId == null ? undefined : categoriesById.get(a.categoryId);
      return {
        categoryId: a.categoryId,
        categoryName: category?.name ?? null,
        // 旧 buildTagPL は色未設定を server 側で 'indigo' へ既定していたが、ここでは
        // null をそのまま返す（意図的な変更、#2204 クロスレビュー P3-5）。categories.color は
        // 実 schema で nullable なので、既定色への解決は consumer 側の resolveTagColor に
        // 統一する（useTimePLData / MCP 双方が同じ関数を通るようにするため）。
        categoryColor: category?.color ?? null,
        categoryIcon: category?.icon ?? null,
        budgetMinutes: a.plannedMinutes,
        actualMinutes: a.recordedMinutes,
        isPlanned: a.hasPlan,
        isUncategorized: a.categoryId == null,
      };
    })
    .sort((x, y) => y.actualMinutes - x.actualMinutes);
}

export function buildSegmentTotals(
  plans: ReadonlyArray<AxisPlanRow>,
  records: ReadonlyArray<AxisRecordRow>,
  activitiesById: ReadonlyMap<string, ActivityLookupRow>,
  segments: ReadonlyArray<{ id: string; name: string; activityIds: ReadonlyArray<string> }>,
): SegmentTotalRow[] {
  const knownActivityIds = new Set(activitiesById.keys());
  const activityIdsBySegmentId = new Map<string, ReadonlySet<string>>(
    segments.map((s) => [s.id, new Set(s.activityIds)]),
  );

  const aggregates = aggregateBySegment(
    toDurationRows(plans, knownActivityIds),
    toDurationRows(records, knownActivityIds),
    activityIdsBySegmentId,
  );
  const nameById = new Map(segments.map((s) => [s.id, s.name]));

  return aggregates
    .map((a) => ({
      segmentId: a.segmentId,
      segmentName: nameById.get(a.segmentId) ?? '',
      budgetMinutes: a.plannedMinutes,
      actualMinutes: a.recordedMinutes,
    }))
    .sort((x, y) => y.actualMinutes - x.actualMinutes);
}
