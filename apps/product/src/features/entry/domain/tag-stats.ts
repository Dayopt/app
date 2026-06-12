/**
 * タグ別統計（counts / lastUsed）の pure aggregation。
 *
 * Server 層 (`features/entry/server/statistics.ts`) の `getTagStats` から
 * DB 非依存の純粋な reduce を切り出している。
 *
 * 注: `buildTagDashboard` (`./tag-dashboard.ts`) は entry rows から daily 集計を
 * 組み立てる別概念で、入力 / 出力 / 消費者が異なるため並置している。
 */

interface TagStatsRow {
  tag_id: string;
  entry_count: number;
  last_used: string | null;
}

interface TagStatsResult {
  /** tagId → entry_count の Record */
  counts: Record<string, number>;
  /** tagId → last_used 日付文字列。null だった row は含まない */
  lastUsed: Record<string, string>;
}

/**
 * RPC `get_tag_stats` の結果を `{ counts, lastUsed }` の 2 Record に reduce する。
 *
 * - `last_used` が null / falsy の row は `lastUsed` から除外（`counts` には含む）
 * - 入力 `null` / `undefined` でも空オブジェクトを返す
 * - 同 tag_id が複数現れた場合は後勝ち（reduce 仕様）
 */
export function aggregateTagStats(
  rows: ReadonlyArray<TagStatsRow> | null | undefined,
): TagStatsResult {
  const counts: Record<string, number> = {};
  const lastUsed: Record<string, string> = {};

  if (rows) {
    for (const row of rows) {
      counts[row.tag_id] = row.entry_count;
      if (row.last_used) {
        lastUsed[row.tag_id] = row.last_used;
      }
    }
  }

  return { counts, lastUsed };
}
