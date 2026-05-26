/**
 * 見積もり精度（estimation accuracy）の pure transformation。
 *
 * Server 層 (`features/entry/server/statistics.ts`) の `getEstimationAccuracy`
 * から DB 行 → tRPC response shape の snake→camel 変換だけを切り出している。
 *
 * Review UI が消費する型 (`features/review/types/metrics.types.ts` の
 * `EstimationAccuracyData`) と構造的に互換だが、boundary rule により
 * review/domain への配置は不可。
 */

export interface EstimationAccuracyDbRow {
  tag_id: string;
  tag_name: string;
  tag_color: string;
  avg_planned_minutes: number;
  avg_actual_minutes: number;
  avg_deviation_minutes: number;
  entry_count: number;
}

export interface EstimationAccuracyItem {
  tagId: string;
  tagName: string;
  /** 空文字の場合は 'indigo' にフォールバック */
  tagColor: string;
  avgPlannedMinutes: number;
  avgActualMinutes: number;
  avgDeviationMinutes: number;
  entryCount: number;
}

/**
 * DB RPC 行配列を tRPC response 用に変換する。
 *
 * - snake_case → camelCase
 * - `tag_color` が空文字なら `'indigo'` にフォールバック
 */
export function transformEstimationAccuracy(
  rows: ReadonlyArray<EstimationAccuracyDbRow>,
): EstimationAccuracyItem[] {
  return rows.map((row) => ({
    tagId: row.tag_id,
    tagName: row.tag_name,
    tagColor: row.tag_color || 'indigo',
    avgPlannedMinutes: row.avg_planned_minutes,
    avgActualMinutes: row.avg_actual_minutes,
    avgDeviationMinutes: row.avg_deviation_minutes,
    entryCount: row.entry_count,
  }));
}
