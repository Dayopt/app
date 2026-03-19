import { create } from 'zustand';

/**
 * Tag キャッシュストア
 *
 * TanStack Queryのキャッシュを補完し、Realtime更新との競合を防止
 *
 * 用途:
 * - mutation実行中カウント管理（複数mutation同時実行対応）
 * - 複数コンポーネント間でのタグ状態同期
 */

interface TagCacheState {
  // mutation実行中カウント（参照カウント方式：複数mutation同時実行対応）
  mutationCount: number;
  incrementMutation: () => void;
  decrementMutation: () => void;
  // invalidate完了待機中フラグ（Race Condition防止用）
  isSettling: boolean;
  setIsSettling: (value: boolean) => void;
}

/** タグmutation数とリアルタイム更新競合防止フラグを管理するZustandストア */
export const useTagCacheStore = create<TagCacheState>((set) => ({
  mutationCount: 0,
  incrementMutation: () => set((state) => ({ mutationCount: state.mutationCount + 1 })),
  decrementMutation: () =>
    set((state) => ({ mutationCount: Math.max(0, state.mutationCount - 1) })),
  isSettling: false,
  setIsSettling: (value) => set({ isSettling: value }),
}));
