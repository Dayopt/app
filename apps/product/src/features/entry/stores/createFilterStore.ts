import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { platformStorage } from '@/lib/zustand/storage';

/**
 * フィルターストアの基本型
 */
export interface BaseFilterState {
  /** 検索UIの展開状態（永続化対象外） */
  isSearchOpen: boolean;
}

/**
 * フィルターストアのアクション型
 */
interface BaseFilterActions {
  setIsSearchOpen: (isOpen: boolean) => void;
  reset: () => void;
}

/**
 * フィルターストアファクトリーのオプション
 */
interface CreateFilterStoreOptions<TState extends BaseFilterState, TExtra = object> {
  /** ストア名（LocalStorageキー） */
  name: string;
  /** 初期状態 */
  initialState: TState;
  /** 追加のアクション（省略可） */
  extraActions?: (
    set: (partial: Partial<TState> | ((state: TState) => Partial<TState>)) => void,
    get: () => TState,
  ) => TExtra;
}

/**
 * フィルターストアファクトリー
 *
 * LocalStorage永続化付きのフィルターストアを生成
 *
 * 共通機能:
 * - 各フィールドに対する setter 自動生成
 * - `reset()` メソッド
 * - `isSearchOpen` 管理（永続化対象外）
 * - LocalStorage 永続化（`partialize` で `isSearchOpen` を除外）
 *
 * @template TState フィルター状態の型（BaseFilterStateを継承）
 * @template TExtra 追加アクションの型
 * @param options ストア設定
 * @returns Zustand ストア
 *
 * @example
 * ```typescript
 * interface EntryFilterState extends BaseFilterState {
 *   status: ('open' | 'closed')[];
 *   tags: string[];
 *   search: string;
 * }
 *
 * const useEntryFilterStore = createFilterStore({
 *   name: 'entry-filter',
 *   initialState: {
 *     status: [],
 *     tags: [],
 *     search: '',
 *     isSearchOpen: false,
 *   },
 * });
 * ```
 */
export function createFilterStore<TState extends BaseFilterState, TExtra extends object = object>(
  options: CreateFilterStoreOptions<TState, TExtra>,
) {
  const { name, initialState, extraActions } = options;

  // Stateのキーから自動的にsetterを生成
  type SetterKey = `set${Capitalize<string & keyof Omit<TState, 'isSearchOpen'>>}`;
  type Setters = {
    [K in keyof Omit<TState, 'isSearchOpen'> as `set${Capitalize<string & K>}`]: (
      value: TState[K],
    ) => void;
  };

  type FilterStore = TState & Setters & BaseFilterActions & TExtra;

  return create<FilterStore>()(
    persist(
      (set, get) => {
        // 各フィールドのsetterを自動生成
        const setters = {} as Setters;
        const stateKeys = Object.keys(initialState).filter((key) => key !== 'isSearchOpen');

        for (const key of stateKeys) {
          const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}` as SetterKey;
          // @ts-expect-error - 動的にsetterを生成しているため型推論が効かない
          setters[setterName] = (value: unknown) => set({ [key]: value } as Partial<FilterStore>);
        }

        // 追加アクションを取得
        const extra = extraActions
          ? extraActions(
              set as (partial: Partial<TState> | ((state: TState) => Partial<TState>)) => void,
              get as () => TState,
            )
          : ({} as TExtra);

        return {
          ...initialState,
          ...setters,
          setIsSearchOpen: (isSearchOpen: boolean) => set({ isSearchOpen } as Partial<FilterStore>),
          reset: () => set(initialState as unknown as Partial<FilterStore>),
          ...extra,
        } as FilterStore;
      },
      {
        name,
        storage: platformStorage(),
        // isSearchOpenは永続化しない（ページリロード時は閉じているべき）
        partialize: (state) => {
          const { isSearchOpen, ...rest } = state as TState & Setters & BaseFilterActions & TExtra;
          return rest;
        },
      },
    ),
  );
}
