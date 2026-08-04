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

  /** 未分類（tag_id=null）ブロックの表示設定（デフォルト: 表示） */
  showUntagged: boolean;

  /**
   * `syncWithTags` が最後に認識した全タグ ID（アーカイブ済み含む）の集合。
   *
   * `visibleTagIds` だけでは「新規タグ」と「意図的に非表示にしたタグ」を区別できず、
   * showOnlyUntagged 等で visibleTagIds を空にした直後に syncWithTags が走ると
   * 全タグが「新規」と誤認されて復活してしまう（#1576フォローアップ）。この集合を
   * 既知タグの基準にすることで区別する。syncWithTags 以外のアクションでは更新しない。
   */
  knownTagIds: Set<string>;
}

/** カレンダーフィルターのアクションインターフェース */
interface CalendarFilterActions {
  /** タグの表示切替 */
  toggleTag: (tagId: string) => void;

  /** 未分類（タグなし）ブロックの表示切替 */
  toggleShowUntagged: () => void;

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

  /** 未分類ブロックだけ表示（タグを全てOFF） */
  showOnlyUntagged: () => void;

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
  showUntagged: boolean;
  knownTagIds: string[];
}

// カスタムシリアライザー（Setの永続化対応）
const setSerializer = {
  serialize: (state: CalendarFilterState): SerializedCalendarFilterState => ({
    visibleTagIds: Array.from(state.visibleTagIds),
    initialized: state.initialized,
    showUntagged: state.showUntagged,
    knownTagIds: Array.from(state.knownTagIds),
  }),
  deserialize: (state: unknown): CalendarFilterState => {
    if (typeof state !== 'object' || state === null) {
      return {
        visibleTagIds: new Set<string>(),
        initialized: false,
        showUntagged: true,
        knownTagIds: new Set<string>(),
      };
    }

    const rawVisibleTagIds = Reflect.get(state, 'visibleTagIds');
    const rawInitialized = Reflect.get(state, 'initialized');
    const rawShowUntagged = Reflect.get(state, 'showUntagged');
    const rawKnownTagIds = Reflect.get(state, 'knownTagIds');
    const visibleTagIds = Array.isArray(rawVisibleTagIds)
      ? rawVisibleTagIds.filter((tagId): tagId is string => typeof tagId === 'string')
      : [];
    // v6以前(knownTagIdsキーが無い)からの移行は visibleTagIds を既知集合の初期値として使う。
    // syncWithTags が次に走った時点で正しい knownTagIds に上書きされる一回限りの近似値。
    const knownTagIds = Array.isArray(rawKnownTagIds)
      ? rawKnownTagIds.filter((tagId): tagId is string => typeof tagId === 'string')
      : visibleTagIds;

    return {
      visibleTagIds: new Set(visibleTagIds),
      initialized: rawInitialized === true,
      // 追加以前(v5以前)の永続化データにはキーが無いため、その場合は表示(true)をデフォルトにする
      showUntagged: typeof rawShowUntagged === 'boolean' ? rawShowUntagged : true,
      knownTagIds: new Set(knownTagIds),
    };
  },
};

export function migrateCalendarFilterState(
  persistedState: unknown,
  version: number,
): CalendarFilterState {
  if (version < 5 || typeof persistedState !== 'object' || persistedState === null) {
    return {
      visibleTagIds: new Set<string>(),
      initialized: false,
      showUntagged: true,
      knownTagIds: new Set<string>(),
    };
  }

  const rawVisibleTagIds = Reflect.get(persistedState, 'visibleTagIds');
  const rawInitialized = Reflect.get(persistedState, 'initialized');
  const rawShowUntagged = Reflect.get(persistedState, 'showUntagged');
  const rawKnownTagIds = Reflect.get(persistedState, 'knownTagIds');
  const visibleTagIds =
    rawVisibleTagIds instanceof Set
      ? Array.from(rawVisibleTagIds).filter((tagId): tagId is string => typeof tagId === 'string')
      : [];
  // v6以前(knownTagIdsキーが無い)からの移行は visibleTagIds を既知集合の初期値として使う。
  // 次回の syncWithTags で正しい値に上書きされる一回限りの近似値（#1576フォローアップ）。
  const knownTagIds =
    rawKnownTagIds instanceof Set
      ? Array.from(rawKnownTagIds).filter((tagId): tagId is string => typeof tagId === 'string')
      : visibleTagIds;

  return {
    visibleTagIds: new Set(visibleTagIds),
    initialized: rawInitialized === true,
    // v6以前(showUntaggedキーが無い状態)からの移行は表示(true)をデフォルトにする
    showUntagged: typeof rawShowUntagged === 'boolean' ? rawShowUntagged : true,
    knownTagIds: new Set(knownTagIds),
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
        showUntagged: true,
        knownTagIds: new Set<string>(),

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

        toggleShowUntagged: () => set((state) => ({ showUntagged: !state.showUntagged })),

        showAllTags: (tagIds) =>
          set(() => ({
            visibleTagIds: new Set(tagIds),
          })),

        hideAllTags: () =>
          set(() => ({
            visibleTagIds: new Set(),
            showUntagged: false,
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
            const tagIdSet = new Set(tagIds);

            if (!state.initialized) {
              // 初回は全タグを表示
              return {
                visibleTagIds: new Set(tagIds),
                knownTagIds: tagIdSet,
                initialized: true,
              };
            }

            // 2 回目以降: 既存の visible / hidden toggle を保持しつつ
            //   - 新規タグ（knownTagIds に無い ID）は visible として追加
            //   - 削除済みタグ（tagIdSet に無い visible ID）は orphan として除去
            //
            // 「新規タグ」の判定は knownTagIds（前回 syncWithTags 時点の全タグ集合）で
            // 行う。visibleTagIds で判定すると、showOnlyUntagged 等で意図的に
            // visibleTagIds を空にした直後の sync で「既存タグ全部が新規」に見えて
            // 復活してしまう（#1576フォローアップ）。
            const newSet = new Set<string>();
            for (const id of state.visibleTagIds) {
              if (tagIdSet.has(id)) newSet.add(id);
            }
            for (const id of tagIds) {
              if (!state.knownTagIds.has(id)) newSet.add(id);
            }
            return { visibleTagIds: newSet, knownTagIds: tagIdSet };
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
            showUntagged: false,
          })),

        showOnlyUntagged: () =>
          set(() => ({
            visibleTagIds: new Set(),
            showUntagged: true,
          })),

        showOnlyGroupTags: (tagIds) =>
          set(() => ({
            visibleTagIds: new Set(tagIds),
            showUntagged: false,
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

          // タグなし(未分類) → showUntagged フラグに従う
          // (#1576: タグ削除で未分類化したブロックをフィルターできるようにshowUntagged復活)
          if (tagId === null) {
            return state.showUntagged;
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
        version: 7,
        storage: createPlatformStorage<CalendarFilterState>({
          serialize: setSerializer.serialize,
          deserialize: setSerializer.deserialize,
        }),
        partialize: ({ visibleTagIds, initialized, showUntagged, knownTagIds }) => ({
          visibleTagIds,
          initialized,
          showUntagged,
          knownTagIds,
        }),
        // v5: visibleTypes (origin filter) を削除 — unplanned origin 廃止
        // v6: showUntagged 復活。未分類(tag_id=null)ブロックのフィルター対応（#1576）。
        //     既存ユーザーはキーが無いため migrate で表示(true)をデフォルトにする
        // v7: knownTagIds 追加。syncWithTags が「新規タグ」と「意図的に非表示にした
        //     既知タグ」を区別するための基準集合（#1576フォローアップ）。
        //     既存ユーザーはキーが無いため migrate で visibleTagIds を初期値にする
        migrate: migrateCalendarFilterState,
      },
    ),
    { name: 'calendar-filter-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
