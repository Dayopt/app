/**
 * Category / Activity の取得系フック。
 *
 * **一覧クエリの入力を 1 種類に固定する。** `listActivities` / `listCategories` は
 * `includeArchived` を取れるが、入力ごとに別キャッシュができるため、複数の入力を使うと
 * 楽観的更新の書き込み先が分裂する（片方だけ更新されて画面がちらつく）。
 * そこで **常にアーカイブ込みで 1 本引き、通常 / アーカイブの絞り込みは client 側で行う**。
 * サイドバー用の `listTree` だけは別クエリ（サーバーが配置規則ごと返すため）。
 */

import { useMemo } from 'react';

import { trpc } from '@/lib/trpc/client';
import type { Activity, Category } from '../types';

/** 一覧クエリの唯一の入力。楽観的更新の書き込み先をこのキーに揃える */
export const ACTIVITY_LIST_INPUT = { includeArchived: true } as const;
export const CATEGORY_LIST_INPUT = { includeArchived: true } as const;

const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * サイドバー用スナップショット（カテゴリー + 所属アクティビティ + 未分類）。
 *
 * アーカイブ済みは含まない。所属カテゴリーがアーカイブ済みの現役アクティビティを
 * 未分類へ寄せる処理はサーバー側で済んでいる（`activities-query-service.ts`）。
 */
export function useActivityTree() {
  return trpc.activities.listTree.useQuery(undefined, { staleTime: STALE_TIME_MS });
}

/** アーカイブ済みを含む全アクティビティ。絞り込み前の生データ */
export function useAllActivities() {
  return trpc.activities.listActivities.useQuery(ACTIVITY_LIST_INPUT, {
    staleTime: STALE_TIME_MS,
  });
}

/** アーカイブ済みを含む全カテゴリー。絞り込み前の生データ */
export function useAllCategories() {
  return trpc.activities.listCategories.useQuery(CATEGORY_LIST_INPUT, {
    staleTime: STALE_TIME_MS,
  });
}

function useFiltered<T extends { archived_at: string | null }>(
  data: T[] | undefined,
  archived: boolean,
): T[] | undefined {
  return useMemo(
    () => data?.filter((item) => (item.archived_at !== null) === archived),
    [data, archived],
  );
}

/** 現役のアクティビティ（選択候補に出せるもの） */
export function useActivities() {
  const query = useAllActivities();
  const data = useFiltered<Activity>(query.data, false);
  return { ...query, data };
}

/** アーカイブ済みのアクティビティ（参照・復元・完全削除の対象） */
export function useArchivedActivities() {
  const query = useAllActivities();
  const data = useFiltered<Activity>(query.data, true);
  return { ...query, data };
}

/** 現役のカテゴリー */
export function useCategories() {
  const query = useAllCategories();
  const data = useFiltered<Category>(query.data, false);
  return { ...query, data };
}

/** アーカイブ済みのカテゴリー */
export function useArchivedCategories() {
  const query = useAllCategories();
  const data = useFiltered<Category>(query.data, true);
  return { ...query, data };
}
