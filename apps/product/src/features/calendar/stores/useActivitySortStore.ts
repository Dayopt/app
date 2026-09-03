/**
 * サイドバーのアクティビティ並び順（localStorage 永続化）。
 *
 * **並び替えはカテゴリー配下と未分類の両方に一様にかかる。** 「未分類は最終
 * アクティビティ順、仕事カテゴリだけ名前順」を欲しがる場面が無いので、
 * セクションごとには持たない（2026-09-03 User 判断）。
 *
 * 一方で表示ステータス（すべて / アクティブ / アーカイブ）は未分類だけにかかる
 * （2026-08-18 User 指示）。同じ歯車の中に並ぶが、かかる範囲は意図的に違う —
 * ステータスはアーカイブの話、並び替えはアクティビティの話。
 *
 * **カテゴリー自体の順序は名前順で固定**でここでは扱わない。カテゴリーは
 * 構造上数が少なく、並べ替える必要が薄い。
 *
 * `sort_order` 列は持たない（#2162）。ここにあるのは「どう並べて見せるか」の
 * 表示設定だけで、順序をサーバーへ保存する話には戻らない。
 *
 * 端末ごとの好みで十分なので user_settings（DB）ではなく localStorage に置く。
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { platformStorage } from '@/lib/zustand/storage';

/**
 * `name`: 名前順（既定）。使っても並びが動かないので場所を覚えられる。
 * `lastUsed`: 最終アクティビティ順。よく使うものが上に来るが、使うたびに動く。
 */
export type ActivitySortKey = 'name' | 'lastUsed';

interface ActivitySortState {
  sortKey: ActivitySortKey;
}

interface ActivitySortActions {
  setSortKey: (sortKey: ActivitySortKey) => void;
}

type ActivitySortStore = ActivitySortState & ActivitySortActions;

/** 保存値が壊れていても既定へ落とす（localStorage は手で書き換えられる） */
export function migrateActivitySortState(persistedState: unknown): ActivitySortState {
  const sortKey =
    typeof persistedState === 'object' && persistedState !== null
      ? Reflect.get(persistedState, 'sortKey')
      : undefined;

  return { sortKey: sortKey === 'lastUsed' ? 'lastUsed' : 'name' };
}

export const useActivitySortStore = create<ActivitySortStore>()(
  devtools(
    persist<ActivitySortStore, [], [], ActivitySortState>(
      (set) => ({
        sortKey: 'name',
        setSortKey: (sortKey) => set({ sortKey }),
      }),
      {
        name: 'activity-sort-storage',
        version: 1,
        storage: platformStorage<ActivitySortState>(),
        partialize: ({ sortKey }) => ({ sortKey }),
        migrate: migrateActivitySortState,
      },
    ),
    { name: 'activity-sort-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
