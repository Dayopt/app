/**
 * タグ完全削除の確認判定で使う「影響を受ける件数」の算出。
 *
 * `api.statistics.getTagStats` は records の実績件数（`counts`）と Plan の件数
 * （`planCounts`）を別々に返す。タグ削除は `ON DELETE SET NULL` で Plan / Record
 * 両方を未分類化するため、削除判定・確認ダイアログの件数は両方の合計が必要
 * （#1576 フォローアップ: Plan のみ・Record 0 件のタグが 0 件と誤判定され、
 * 確認ダイアログなしで即削除されてしまう不具合の修正）。
 *
 * `counts`（records のみ）自体は変更しない。実績件数としての意味を保つため、
 * 表示用途で使う場合は引き続き `tagStats.counts` を直接参照する。
 */

interface TagStatsForDeleteCount {
  counts: Record<string, number>;
  planCounts: Record<string, number>;
}

/**
 * records + plans の合計件数を tagId ごとに算出する。
 *
 * @param tagStats - `api.statistics.getTagStats` の結果。取得前は undefined
 * @param isError - 取得エラー時は集計不能なため、呼び出し側で安全側（常に確認ダイアログ）に倒す
 * @returns tagId → 合計件数の Record。エラー時は null
 */
export function mergeTagDeleteCounts(
  tagStats: TagStatsForDeleteCount | undefined,
  isError: boolean,
): Record<string, number> | null {
  if (isError) return null;

  const recordCounts = tagStats?.counts ?? {};
  const planCounts = tagStats?.planCounts ?? {};

  const merged: Record<string, number> = { ...recordCounts };
  for (const tagId of Object.keys(planCounts)) {
    merged[tagId] = (merged[tagId] ?? 0) + (planCounts[tagId] ?? 0);
  }
  return merged;
}
