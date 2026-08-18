/**
 * アクティビティ ID から表示情報を引くフック（表示専用の全件 lookup）。
 *
 * 予定・記録は `activityId` しか持たないので、カレンダーのブロックはここで名前と
 * 見た目を解決する。**色とアイコンは所属カテゴリーから継承する**（アクティビティ自身は
 * 持たない、#2162 §4-6）。
 *
 * アクティブ + アーカイブ済みの両方を含める。アーカイブしても過去のブロックは元の名前で
 * 表示し続ける仕様なので、現役だけで引くとアーカイブ済みを参照する過去ブロックが
 * 「アクティビティなし」へ落ちてしまう。**選択候補**が要る場面ではこのフックを使わず
 * `useActivities()` / `useActivityTree()` を使う（意図的にアーカイブ済みを含まない）。
 *
 * @example
 * ```tsx
 * const { getActivityById } = useActivitiesMap();
 * const activity = entry.activityId ? getActivityById(entry.activityId) : undefined;
 * ```
 */

import { useCallback, useMemo } from 'react';

import { useAllActivities, useAllCategories } from './useActivitiesQuery';

/** ブロック表示に必要な最小限の情報 */
export interface ActivityDisplayInfo {
  id: string;
  name: string;
  /** 所属カテゴリー ID。null = 未分類 */
  categoryId: string | null;
  /** 所属カテゴリー名。null = 未分類 */
  categoryName: string | null;
  /**
   * 継承した表示色。**null = 未分類**（中立表示にする）。
   * 呼び出し側はこの null を「アクティビティなし」と混同しないこと —
   * アクティビティなしは `activityId` 自体が null のケース。
   */
  color: string | null;
  /** 継承した表示アイコン。null = 未設定または未分類 */
  icon: string | null;
}

export function useActivitiesMap() {
  const { data: activities } = useAllActivities();
  const { data: categories } = useAllCategories();

  const activitiesMap = useMemo(() => {
    const categoryById = new Map((categories ?? []).map((category) => [category.id, category]));
    const map = new Map<string, ActivityDisplayInfo>();

    for (const activity of activities ?? []) {
      const category = activity.category_id ? categoryById.get(activity.category_id) : undefined;
      map.set(activity.id, {
        id: activity.id,
        name: activity.name,
        categoryId: activity.category_id,
        categoryName: category?.name ?? null,
        color: category?.color ?? null,
        icon: category?.icon ?? null,
      });
    }

    return map;
  }, [activities, categories]);

  const getActivityById = useCallback(
    (activityId: string): ActivityDisplayInfo | undefined => activitiesMap.get(activityId),
    [activitiesMap],
  );

  const getActivitiesByIds = useCallback(
    (activityIds: string[]): ActivityDisplayInfo[] =>
      activityIds
        .map((id) => activitiesMap.get(id))
        .filter((item): item is ActivityDisplayInfo => item !== undefined),
    [activitiesMap],
  );

  return {
    activitiesMap,
    getActivityById,
    getActivitiesByIds,
    // 両クエリが揃うまでは loading 扱いにする。片方だけ未取得の間に「アクティビティなし」へ
    // 誤フォールバックしうることを呼び出し側が判別できるようにするため。
    isLoading: !activities || !categories,
  };
}
