import { create } from 'zustand';

/**
 * Tag キャッシュストア
 *
 * 用途:
 * - invalidate完了待機中フラグ（CalendarFilterListのRace Condition防止用）
 */

interface TagCacheState {
  // invalidate完了待機中フラグ（Race Condition防止用）
  isSettling: boolean;
  setIsSettling: (value: boolean) => void;
}

/** タグキャッシュの待機状態を管理するZustandストア */
export const useTagCacheStore = create<TagCacheState>((set) => ({
  isSettling: false,
  setIsSettling: (value) => set({ isSettling: value }),
}));
