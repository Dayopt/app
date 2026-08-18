/**
 * `activities.listTree` のキャッシュを楽観的に書き換える純関数群。
 *
 * サーバーの `listTree`（`server/activities-query-service.ts`）と**同じ配置規則**を再現する。
 * ズレると mutation 直後の表示と `onSettled` の refetch 後の表示が食い違い、行が飛ぶ。
 * 規則は 2 つ:
 *
 * 1. 並びは名前順（`sort_order` は持たない。#2162 §4-7）
 * 2. 所属カテゴリーが tree に居ないアクティビティは未分類へ寄せる
 *    — カテゴリーのアーカイブは所属アクティビティを道連れにしないため、
 *      「現役アクティビティだが所属カテゴリーはアーカイブ済み」の行が実在する。
 *      拾わないとサイドバーから黙って消える（予定・記録には残ったまま）
 *
 * 並びの比較は `Intl.Collator` に固定する。サーバー側は PostgreSQL の照合順序なので
 * 完全一致はしないが、ロケール差で client 側の並びがぶれるのは防げる。
 */

import type { Activity, ActivityTree, Category } from '../types';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function byName(a: { name: string }, b: { name: string }): number {
  return collator.compare(a.name, b.name);
}

function sortedByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort(byName);
}

/** tree 全体から対象アクティビティを取り除く（どのバケットに居ても） */
export function removeActivityFromTree(
  tree: ActivityTree | undefined,
  activityId: string,
): ActivityTree | undefined {
  if (!tree) return tree;
  return {
    categories: tree.categories.map((node) => ({
      ...node,
      activities: node.activities.filter((activity) => activity.id !== activityId),
    })),
    uncategorized: tree.uncategorized.filter((activity) => activity.id !== activityId),
  };
}

/**
 * アクティビティを tree へ挿入または更新する。
 *
 * `replaceId` は楽観的作成で使った一時 ID。サーバー応答で本物の行へ差し替える時に渡す。
 * カテゴリーの移動（`category_id` の変更）も、いったん全バケットから外してから
 * 入れ直すことで同じ経路で扱える。
 */
export function upsertActivityInTree(
  tree: ActivityTree | undefined,
  activity: Activity,
  replaceId?: string,
): ActivityTree | undefined {
  if (!tree) return tree;

  const withoutTarget = removeActivityFromTree(
    replaceId ? removeActivityFromTree(tree, replaceId) : tree,
    activity.id,
  );
  if (!withoutTarget) return withoutTarget;

  // アーカイブ済みは一覧に出さない（サーバーの listTree と同じ）
  if (activity.archived_at !== null) return withoutTarget;

  const targetCategory =
    activity.category_id === null
      ? undefined
      : withoutTarget.categories.find((node) => node.category.id === activity.category_id);

  if (!targetCategory) {
    return {
      ...withoutTarget,
      uncategorized: sortedByName([...withoutTarget.uncategorized, activity]),
    };
  }

  return {
    ...withoutTarget,
    categories: withoutTarget.categories.map((node) =>
      node.category.id === targetCategory.category.id
        ? { ...node, activities: sortedByName([...node.activities, activity]) }
        : node,
    ),
  };
}

/**
 * カテゴリーを tree へ挿入または更新する。所属アクティビティは維持する。
 *
 * アーカイブ済みのカテゴリーは見出しごと消え、所属していたアクティビティは未分類へ移る
 * （カテゴリーのアーカイブはアクティビティを道連れにしない、という §4-8 の意味論）。
 */
export function upsertCategoryInTree(
  tree: ActivityTree | undefined,
  category: Category,
  replaceId?: string,
): ActivityTree | undefined {
  if (!tree) return tree;

  if (category.archived_at !== null) {
    return removeCategoryFromTree(tree, category.id);
  }

  const existing = tree.categories.find(
    (node) => node.category.id === category.id || (replaceId && node.category.id === replaceId),
  );

  if (existing) {
    const nextCategories = tree.categories.map((node) =>
      node === existing ? { category, activities: node.activities } : node,
    );
    return {
      ...tree,
      categories: [...nextCategories].sort((a, b) => byName(a.category, b.category)),
    };
  }

  return {
    ...tree,
    categories: [...tree.categories, { category, activities: [] }].sort((a, b) =>
      byName(a.category, b.category),
    ),
  };
}

/**
 * カテゴリーを tree から取り除き、所属していたアクティビティを未分類へ移す。
 *
 * 削除（FK の `ON DELETE SET NULL (category_id)`）とアーカイブの両方で同じ見え方になる。
 * 連鎖削除はしない（#2162 §4-8「時間データを消さない」）。
 */
export function removeCategoryFromTree(
  tree: ActivityTree | undefined,
  categoryId: string,
): ActivityTree | undefined {
  if (!tree) return tree;

  const target = tree.categories.find((node) => node.category.id === categoryId);
  if (!target) return tree;

  return {
    categories: tree.categories.filter((node) => node.category.id !== categoryId),
    uncategorized: sortedByName([...tree.uncategorized, ...target.activities]),
  };
}

/**
 * カレンダーフィルターの同期対象になるアクティビティ ID。
 *
 * **カテゴリー ID は含めない。** 予定・記録が参照できるのはアクティビティだけで、
 * カテゴリーを直接参照する行は構造上作れない（`plans.activity_id` の 1 本のみ）。
 * 旧タグモデルでは親タグを直接参照するブロックがありえたため親 ID も混ぜていたが、
 * 新モデルではその必要が無い。
 */
export function collectActivityIdsFromTree(tree: ActivityTree | undefined): string[] {
  if (!tree) return [];
  return [
    ...tree.categories.flatMap((node) => node.activities.map((activity) => activity.id)),
    ...tree.uncategorized.map((activity) => activity.id),
  ];
}

/** tree に含まれる全アクティビティ（同名衝突の検出・カテゴリー変更ピッカー用） */
export function collectActivitiesFromTree(tree: ActivityTree | undefined): Activity[] {
  if (!tree) return [];
  return [...tree.categories.flatMap((node) => node.activities), ...tree.uncategorized];
}
