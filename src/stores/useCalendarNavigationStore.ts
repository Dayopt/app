/**
 * カレンダー日付ナビゲーションストア
 *
 * 検索等の外部機能からカレンダーの表示日付を変更するための仲介ストア。
 * pendingDate をセットすると、カレンダー composition layer が検知して navigateToDate を呼ぶ。
 */

import { create } from 'zustand';

import type { CalendarViewType } from '@/lib/calendar-constants';

interface CalendarNavigationStore {
  /** ナビゲーション待ちの日付 */
  pendingDate: Date | null;
  /** カレンダーが現在表示している日付（CalendarNavigationContext から同期） */
  viewedDate: Date;
  /** カレンダーの表示ビュータイプ（CalendarNavigationContext から同期） */
  viewType: CalendarViewType;
  /** 日付ナビゲーションを要求 */
  navigateTo: (date: Date) => void;
  /** 要求をクリア（カレンダー側が消費後に呼ぶ） */
  clearPending: () => void;
  /** 表示日付を同期（CalendarNavigationContext → store） */
  setViewedDate: (date: Date) => void;
  /** ビュータイプを同期（CalendarNavigationContext → store） */
  setViewType: (viewType: CalendarViewType) => void;
}

/** カレンダーの日付ナビゲーションを仲介するZustandストア */
export const useCalendarNavigationStore = create<CalendarNavigationStore>()((set) => ({
  pendingDate: null,
  viewedDate: new Date(),
  viewType: 'week',
  navigateTo: (date) => set({ pendingDate: date }),
  clearPending: () => set({ pendingDate: null }),
  setViewedDate: (date) => set({ viewedDate: date }),
  setViewType: (viewType) => set({ viewType }),
}));
