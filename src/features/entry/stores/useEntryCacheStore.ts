import { create } from 'zustand';

/**
 * Entry mutation ガードストア
 *
 * mutation 実行中カウンターを管理。Realtime 二重更新防止用。
 * boolean ではなくカウンターにすることで、並行 mutation やコンポーネント
 * unmount 時に isMutating が true のままスタックする問題を防止。
 * さらにタイムアウトフォールバック（10秒）で万一のスタックも自動解消。
 */

const MUTATION_TIMEOUT_MS = 10_000;

interface EntryMutationGuardState {
  /** 実行中 mutation の数（0 = 非 mutating） */
  mutatingCount: number;
  /** 後方互換: mutatingCount > 0 */
  isMutating: boolean;
  /** mutation 開始（カウンター +1、タイムアウト自動解除付き） */
  startMutating: () => () => void;
  /** @deprecated boolean setter — 既存コードの移行用。startMutating() を推奨 */
  setIsMutating: (value: boolean) => void;
}

/** Entry mutation ガードストア（mutation中フラグ管理・Realtime二重更新防止） */
export const useEntryCacheStore = create<EntryMutationGuardState>((set, get) => ({
  mutatingCount: 0,
  isMutating: false,

  startMutating: () => {
    set((state) => ({
      mutatingCount: state.mutatingCount + 1,
      isMutating: true,
    }));

    let settled = false;

    // タイムアウトフォールバック: 10秒後に自動デクリメント
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        const current = get().mutatingCount;
        set({
          mutatingCount: Math.max(0, current - 1),
          isMutating: Math.max(0, current - 1) > 0,
        });
      }
    }, MUTATION_TIMEOUT_MS);

    // cleanup 関数を返す（onSettled で呼ぶ）
    return () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        const current = get().mutatingCount;
        set({
          mutatingCount: Math.max(0, current - 1),
          isMutating: Math.max(0, current - 1) > 0,
        });
      }
    };
  },

  setIsMutating: (value) => {
    if (value) {
      set((state) => ({
        mutatingCount: state.mutatingCount + 1,
        isMutating: true,
      }));
    } else {
      const current = get().mutatingCount;
      set({
        mutatingCount: Math.max(0, current - 1),
        isMutating: Math.max(0, current - 1) > 0,
      });
    }
  },
}));
