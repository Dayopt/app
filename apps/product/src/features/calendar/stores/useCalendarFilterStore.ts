/**
 * カレンダー表示フィルターストア
 *
 * Googleカレンダーの「マイカレンダー」のように、
 * タグでカレンダー上の表示/非表示を切り替える
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createPlatformStorage } from '@/lib/zustand/storage';

/** カレンダーフィルターの状態インターフェース */
interface CalendarFilterState {
  /** タグIDごとの表示設定（デフォルト: すべて表示） */
  visibleTagIds: Set<string>;

  /** 初期化済みフラグ（タグ一覧取得後に初期化） */
  initialized: boolean;
}

/** カレンダーフィルターのアクションインターフェース */
interface CalendarFilterActions {
  /** タグの表示切替 */
  toggleTag: (tagId: string) => void;

  /** すべてのタグを表示 */
  showAllTags: (tagIds: string[]) => void;

  /** すべてのタグを非表示 */
  hideAllTags: () => void;

  /** グループ内のタグを一括表示 */
  showGroupTags: (tagIds: string[]) => void;

  /** グループ内のタグを一括非表示 */
  hideGroupTags: (tagIds: string[]) => void;

  /** グループ内のタグを一括切替（全ON→全OFF、それ以外→全ON） */
  toggleGroupTags: (tagIds: string[]) => void;

  /**
   * タグ一覧と filter state を同期する。
   *
   * - 初回: 全タグを表示 + `initialized=true`
   * - 2 回目以降: 既存の visible / hidden toggle を保持しつつ、
   *   新規タグは visible として追加、削除済みタグ（orphan ID）は除去
   */
  syncWithTags: (tagIds: string[]) => void;

  /** 特定のタグを削除（マージ後などに使用） */
  removeTag: (tagId: string) => void;

  /** このタグだけ表示（他を全てOFF） */
  showOnlyTag: (tagId: string) => void;

  /** 指定タグだけ表示（グループ用） */
  showOnlyGroupTags: (tagIds: string[]) => void;

  /** タグが表示中かチェック */
  isTagVisible: (tagId: string) => boolean;

  /** グループ内のタグの表示状態を取得（all: 全ON, none: 全OFF, some: 一部） */
  getGroupVisibility: (tagIds: string[]) => 'all' | 'none' | 'some';

  /** タグフィルタに一致するかチェック（起源は無視） */
  matchesTagFilter: (tagId: string | null) => boolean;

  /** エントリが表示対象かチェック（タグフィルター） */
  isEntryVisible: (tagId: string | null) => boolean;
}

type CalendarFilterStore = CalendarFilterState & CalendarFilterActions;

// シリアライズ済みの状態型
interface SerializedCalendarFilterState {
  visibleTagIds: string[];
  initialized: boolean;
}

// カスタムシリアライザー（Setの永続化対応）
const setSerializer = {
  serialize: (state: CalendarFilterState): SerializedCalendarFilterState => ({
    visibleTagIds: Array.from(state.visibleTagIds),
    initialized: state.initialized,
  }),
  deserialize: (state: unknown): CalendarFilterState => {
    if (typeof state !== 'object' || state === null) {
      return { visibleTagIds: new Set<string>(), initialized: false };
    }

    const rawVisibleTagIds = Reflect.get(state, 'visibleTagIds');
    const rawInitialized = Reflect.get(state, 'initialized');
    const visibleTagIds = Array.isArray(rawVisibleTagIds)
      ? rawVisibleTagIds.filter((tagId): tagId is string => typeof tagId === 'string')
      : [];

    return {
      visibleTagIds: new Set(visibleTagIds),
      initialized: rawInitialized === true,
    };
  },
};

export function migrateCalendarFilterState(
  persistedState: unknown,
  version: number,
): CalendarFilterState {
  if (version < 5 || typeof persistedState !== 'object' || persistedState === null) {
    return { visibleTagIds: new Set<string>(), initialized: false };
  }

  const rawVisibleTagIds = Reflect.get(persistedState, 'visibleTagIds');
  const rawInitialized = Reflect.get(persistedState, 'initialized');
  const visibleTagIds =
    rawVisibleTagIds instanceof Set
      ? Array.from(rawVisibleTagIds).filter((tagId): tagId is string => typeof tagId === 'string')
      : [];

  return {
    visibleTagIds: new Set(visibleTagIds),
    initialized: rawInitialized === true,
  };
}

/** カレンダーのタグ表示フィルターを管理するZustandストア（localStorageに永続化） */
export const useCalendarFilterStore = create<CalendarFilterStore>()(
  devtools(
    persist<CalendarFilterStore, [], [], CalendarFilterState>(
      (set, get) => ({
        // 初期状態
        visibleTagIds: new Set<string>(),
        initialized: false,

        // アクション

        toggleTag: (tagId) =>
          set((state) => {
            const newSet = new Set(state.visibleTagIds);
            if (newSet.has(tagId)) {
              newSet.delete(tagId);
            } else {
              newSet.add(tagId);
            }
            return { visibleTagIds: newSet };
          }),

        showAllTags: (tagIds) =>
          set(() => ({
            visibleTagIds: new Set(tagIds),
          })),

        hideAllTags: () =>
          set(() => ({
            visibleTagIds: new Set(),
          })),

        showGroupTags: (tagIds) =>
          set((state) => {
            const newSet = new Set(state.visibleTagIds);
            tagIds.forEach((id) => newSet.add(id));
            return { visibleTagIds: newSet };
          }),

        hideGroupTags: (tagIds) =>
          set((state) => {
            const newSet = new Set(state.visibleTagIds);
            tagIds.forEach((id) => newSet.delete(id));
            return { visibleTagIds: newSet };
          }),

        toggleGroupTags: (tagIds) =>
          set((state) => {
            const newSet = new Set(state.visibleTagIds);
            // 全てONなら全てOFF、それ以外は全てON
            const allVisible = tagIds.every((id) => state.visibleTagIds.has(id));
            if (allVisible) {
              tagIds.forEach((id) => newSet.delete(id));
            } else {
              tagIds.forEach((id) => newSet.add(id));
            }
            return { visibleTagIds: newSet };
          }),

        syncWithTags: (tagIds) =>
          set((state) => {
            if (!state.initialized) {
              // 初回は全タグを表示
              return {
                visibleTagIds: new Set(tagIds),
                initialized: true,
              };
            }

            // 2 回目以降: 既存の visible / hidden toggle を保持しつつ
            //   - 新規タグは visible として追加
            //   - 削除済みタグ（orphan ID）は除去
            const tagIdSet = new Set(tagIds);
            const newSet = new Set<string>();
            for (const id of state.visibleTagIds) {
              if (tagIdSet.has(id)) newSet.add(id);
            }
            for (const id of tagIds) {
              if (!state.visibleTagIds.has(id)) newSet.add(id);
            }
            return { visibleTagIds: newSet };
          }),

        removeTag: (tagId) =>
          set((state) => {
            const newSet = new Set(state.visibleTagIds);
            newSet.delete(tagId);
            return { visibleTagIds: newSet };
          }),

        showOnlyTag: (tagId) =>
          set(() => ({
            visibleTagIds: new Set([tagId]),
          })),

        showOnlyGroupTags: (tagIds) =>
          set(() => ({
            visibleTagIds: new Set(tagIds),
          })),

        isTagVisible: (tagId) => get().visibleTagIds.has(tagId),

        getGroupVisibility: (tagIds) => {
          if (tagIds.length === 0) return 'none';
          const state = get();
          const visibleCount = tagIds.filter((id) => state.visibleTagIds.has(id)).length;
          if (visibleCount === 0) return 'none';
          if (visibleCount === tagIds.length) return 'all';
          return 'some';
        },

        matchesTagFilter: (tagId) => {
          const state = get();

          // タグなし → 常に表示（タグなしフィルター廃止）
          if (tagId === null) {
            return true;
          }

          return state.visibleTagIds.has(tagId);
        },

        isEntryVisible: (tagId) => {
          return get().matchesTagFilter(tagId);
        },
      }),
      {
        name: 'calendar-filter-storage',
        // バージョンを上げるとlocalStorageがリセットされる
        // v2: visibleTagIds競合問題の修正に伴いリセット
        // v3: showUntagged削除、matchesTagFilter/isPlanVisible単一タグ対応
        // v4: ItemType ('plan'|'record') → TimeblockOrigin ('planned'|'unplanned') に変更
        version: 5,
        storage: createPlatformStorage<CalendarFilterState>({
          serialize: setSerializer.serialize,
          deserialize: setSerializer.deserialize,
        }),
        partialize: ({ visibleTagIds, initialized }) => ({ visibleTagIds, initialized }),
        // v5: visibleTypes (origin filter) を削除 — unplanned origin 廃止
        migrate: migrateCalendarFilterState,
      },
    ),
    { name: 'calendar-filter-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
