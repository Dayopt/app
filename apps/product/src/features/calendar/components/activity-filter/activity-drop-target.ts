import type { Activity } from '@/features/activities';

/**
 * 「未分類」を表す drop target の番兵。
 *
 * カテゴリーの ID は UUID なのでこの文字列と衝突しない。`null` を直接
 * target 型にすると「ドロップ先なし」と「未分類へドロップ」が両方 nullish に
 * なって混ざるため、番兵で分ける。
 */
export const DROP_TARGET_UNCATEGORIZED = 'uncategorized';

/** カテゴリー ID、または未分類の番兵 */
export type ActivityDropTarget = string | typeof DROP_TARGET_UNCATEGORIZED;

/** drop target を `activities.category_id` に書く値へ変換する */
export function toCategoryId(target: ActivityDropTarget): string | null {
  return target === DROP_TARGET_UNCATEGORIZED ? null : target;
}

interface CanDropActivityOptions {
  activity: Activity;
  target: ActivityDropTarget;
  /** 同名衝突の検出に使う全アクティビティ（アーカイブ済みを含む） */
  allActivities: Activity[];
}

/**
 * そのアクティビティをその drop target へ落とせるか。
 *
 * **`dragover` と `drop` の両方がこの 1 つの述語を見る。** `dragover` 側で
 * false なら `preventDefault()` を呼ばないので、指を離す前に OS のカーソルが
 * 禁止表示になる。同名衝突を commit 後の toast ではなくカーソルで伝えられるのは
 * この位置に判定を置いた場合だけ（行メニュー経路は commit 時にしか判定できない
 * ので、そちらの toast は残る）。
 */
export function canDropActivity({
  activity,
  target,
  allActivities,
}: CanDropActivityOptions): boolean {
  const targetCategoryId = toCategoryId(target);

  // 自分が今いる場所へのドロップは no-op。書き込むとリストが無意味にちらつく
  if ((activity.category_id ?? null) === targetCategoryId) return false;

  // 移動先に同名がいると UNIQUE 制約に触れる。統合（マージ）は v1 で持たない（#2162 §4-8）
  const hasNameConflict = allActivities.some(
    (candidate) =>
      candidate.id !== activity.id &&
      (candidate.category_id ?? null) === targetCategoryId &&
      candidate.name.toLowerCase() === activity.name.toLowerCase(),
  );

  return !hasNameConflict;
}
