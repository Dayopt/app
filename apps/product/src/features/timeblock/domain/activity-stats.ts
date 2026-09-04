/**
 * アクティビティ別統計（counts / lastUsed）の pure aggregation。
 *
 * Server 層（`features/timeblock/server/statistics-general-service.ts`）の
 * `getActivityStats` から DB 非依存の純粋な reduce を切り出している。
 *
 * grouping key の field 名を `activityId` ではなく `groupKey` にしているのは、
 * この 2 関数が「何で束ねるか」を知らない純関数だからで、#2162 以前は同じ関数を
 * tag 軸でも共有していた。呼び出し側が key を決める。
 */

interface ActivityStatsRow {
  groupKey: string;
  record_count: number;
  last_used: string | null;
}

interface ActivityStatsResult {
  /** activityId → record_count の Record */
  counts: Record<string, number>;
  /** activityId → last_used 日付文字列。null だった row は含まない */
  lastUsed: Record<string, string>;
}

/**
 * 事前集計済みの行を `{ counts, lastUsed }` の 2 Record に reduce する。
 *
 * - `last_used` が null / falsy の row は `lastUsed` から除外（`counts` には含む）
 * - 入力 `null` / `undefined` でも空オブジェクトを返す
 * - 同 `groupKey` が複数現れた場合は後勝ち（reduce 仕様。呼び出し元は key ごとに
 *   事前集計済みの 1 行だけを渡す想定のため、実際には発火しない）
 */
export function aggregateActivityStats(
  rows: ReadonlyArray<ActivityStatsRow> | null | undefined,
): ActivityStatsResult {
  const counts: Record<string, number> = {};
  const lastUsed: Record<string, string> = {};

  if (rows) {
    for (const row of rows) {
      counts[row.groupKey] = row.record_count;
      if (row.last_used) {
        lastUsed[row.groupKey] = row.last_used;
      }
    }
  }

  return { counts, lastUsed };
}

interface ActivityPlanCountRow {
  groupKey: string;
}

/**
 * Plan 行（1 行 = 1 Plan）から activityId → 件数 の Record を作る pure aggregation。
 *
 * アクティビティ削除は Plan / Record 両方を未分類化する（`ON DELETE SET NULL`）ため、
 * 削除確認の「影響を受ける件数」は records（`aggregateActivityStats` の `counts`）と
 * この関数の戻り値の合計が必要。records 専用の `aggregateActivityStats` とは異なり
 * 未集計の生行を受け取るため、`groupKey` ごとに加算する（後勝ちではない）。
 *
 * 参照: 呼び出し元 `StatisticsGeneralService.getActivityStats`
 * （#1576 フォローアップ: Plan のみのアクティビティが 0 件と誤判定され、削除確認
 * ダイアログなしで即削除されてしまう不具合の修正）
 *
 * - 入力 `null` / `undefined` でも空オブジェクトを返す
 * - 未分類（key が null）の Plan は呼び出し元でフィルタ済みの前提
 */
export function aggregateActivityPlanCounts(
  rows: ReadonlyArray<ActivityPlanCountRow> | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};

  if (rows) {
    for (const row of rows) {
      counts[row.groupKey] = (counts[row.groupKey] ?? 0) + 1;
    }
  }

  return counts;
}
