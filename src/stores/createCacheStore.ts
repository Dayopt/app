import { create } from 'zustand';

/**
 * キャッシュストアの状態型
 */
interface CacheState<T> {
  /** エンティティID → キャッシュデータのマップ */
  cache: Record<string, T>;

  /** キャッシュ更新 */
  updateCache: (id: string, data: T) => void;

  /** キャッシュ取得 */
  getCache: (id: string) => T | undefined;

  /** キャッシュクリア */
  clearCache: (id: string) => void;

  /** mutation 実行中フラグ（Realtime 二重更新防止用） */
  isMutating: boolean;
  setIsMutating: (value: boolean) => void;
}

/**
 * キャッシュストアファクトリー
 *
 * TanStack Query のキャッシュを補完し、複数コンポーネント間でのリアルタイム同期を実現
 *
 * 用途:
 * - エンティティ固有フィールドの即座の同期
 * - Inspector、Table が同時に開いている場合の状態管理
 * - mutation 実行中フラグ管理（Realtime 二重更新防止）
 *
 * @template T キャッシュデータの型
 * @returns Zustand ストア
 *
 * @example
 * ```typescript
 * interface EntryCache {
 *   title?: string;
 *   description?: string | null;
 * }
 *
 * export const useEntryCacheStore = createCacheStore<EntryCache>();
 * ```
 */
export function createCacheStore<T>() {
  return create<CacheState<T>>((set, get) => ({
    cache: {},
    isMutating: false,

    updateCache: (id, data) =>
      set((state) => ({
        cache: {
          ...state.cache,
          [id]: {
            ...state.cache[id],
            ...data,
          },
        },
      })),

    getCache: (id) => get().cache[id],

    clearCache: (id) =>
      set((state) => {
        const newCache = { ...state.cache };
        delete newCache[id];
        return { cache: newCache };
      }),

    setIsMutating: (value) => set({ isMutating: value }),
  }));
}
