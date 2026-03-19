/**
 * カレンダー日付ナビゲーションストア
 *
 * 検索等の外部機能からカレンダーの表示日付を変更するための仲介ストア。
 * pendingDate をセットすると、カレンダー composition layer が検知して navigateToDate を呼ぶ。
 */

import { create } from 'zustand';

interface CalendarNavigationStore {
  /** ナビゲーション待ちの日付 */
  pendingDate: Date | null;
  /** 日付ナビゲーションを要求 */
  navigateTo: (date: Date) => void;
  /** 要求をクリア（カレンダー側が消費後に呼ぶ） */
  clearPending: () => void;
}

export const useCalendarNavigationStore = create<CalendarNavigationStore>()((set) => ({
  pendingDate: null,
  navigateTo: (date) => set({ pendingDate: date }),
  clearPending: () => set({ pendingDate: null }),
}));
