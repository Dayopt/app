/**
 * タグ別統計（counts / lastUsed）の pure aggregation。
 *
 * Server 層 (`features/timeblock/server/statistics.ts`) の `getTagStats` から
 * DB 非依存の純粋な reduce を切り出している。
 */

interface TagStatsRow {
  tag_id: string;
  record_count: number;
  last_used: string | null;
}

interface TagStatsResult {
  /** tagId → record_count の Record */
  counts: Record<string, number>;
  /** tagId → last_used 日付文字列。null だった row は含まない */
  lastUsed: Record<string, string>;
}

/**
 * RPC `get_tag_stats` の結果を `{ counts, lastUsed }` の 2 Record に reduce する。
 *
 * - `last_used` が null / falsy の row は `lastUsed` から除外（`counts` には含む）
 * - 入力 `null` / `undefined` でも空オブジェクトを返す
 * - 同 tag_id が複数現れた場合は後勝ち（reduce 仕様。呼び出し元は tag_id ごとに
 *   事前集計済みの 1 行だけを渡す想定のため、実際には発火しない）
 */
export function aggregateTagStats(
  rows: ReadonlyArray<TagStatsRow> | null | undefined,
): TagStatsResult {
  const counts: Record<string, number> = {};
  const lastUsed: Record<string, string> = {};

  if (rows) {
    for (const row of rows) {
      counts[row.tag_id] = row.record_count;
      if (row.last_used) {
        lastUsed[row.tag_id] = row.last_used;
      }
    }
  }

  return { counts, lastUsed };
}

interface TagPlanCountRow {
  tag_id: string;
}

/**
 * Plan 行（1 行 = 1 Plan）から tag_id → 件数 の Record を作る pure aggregation。
 *
 * タグ削除は Plan / Record 両方を未分類化する（`ON DELETE SET NULL`）ため、
 * 削除確認の「影響を受ける件数」は records（`aggregateTagStats` の `counts`）と
 * この関数の戻り値の合計が必要。records 専用の `aggregateTagStats` とは異なり
 * 未集計の生行を受け取るため、tag_id ごとに加算する（後勝ちではない）。
 *
 * 参照: 呼び出し元 `StatisticsGeneralService.getTagStats`
 * （#1576 フォローアップ: Plan のみのタグが 0 件と誤判定され、削除確認ダイアログ
 * なしで即削除されてしまう不具合の修正）
 *
 * - 入力 `null` / `undefined` でも空オブジェクトを返す
 * - `tag_id` が null の Plan（未分類）は呼び出し元でフィルタ済みの前提
 */
export function aggregateTagPlanCounts(
  rows: ReadonlyArray<TagPlanCountRow> | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};

  if (rows) {
    for (const row of rows) {
      counts[row.tag_id] = (counts[row.tag_id] ?? 0) + 1;
    }
  }

  return counts;
}
