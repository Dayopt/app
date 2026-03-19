import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { platformStorage } from '@/lib/zustand/storage';

import type { CalendarViewType } from '../types/calendar.types';

/**
 * カレンダーのスクロール位置を管理するストア
 *
 * 各ビュータイプごとにスクロール位置を記憶し、
 * ビュー切り替え時に復元する
 */

type ScrollPositions = Partial<Record<CalendarViewType, number>>;

interface CalendarScrollState {
  /** ビューごとのスクロール位置（px） */
  scrollPositions: ScrollPositions;
  /** 最後に使用したビュー */
  lastActiveView: CalendarViewType;
}

interface CalendarScrollActions {
  /** スクロール位置を更新 */
  setScrollPosition: (view: CalendarViewType, position: number) => void;
  /** 特定ビューのスクロール位置を取得 */
  getScrollPosition: (view: CalendarViewType) => number;
  /** 最後のアクティブビューを更新 */
  setLastActiveView: (view: CalendarViewType) => void;
  /** スクロール位置をリセット */
  resetScrollPositions: () => void;
}

const DEFAULT_SCROLL_POSITION = 0;

const initialState: CalendarScrollState = {
  scrollPositions: {},
  lastActiveView: 'week',
};

/** カレンダーのスクロール位置をビュー別に永続化するZustandストア */
export const useCalendarScrollStore = create<CalendarScrollState & CalendarScrollActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setScrollPosition: (view, position) =>
        set((state) => ({
          scrollPositions: {
            ...state.scrollPositions,
            [view]: position,
          },
        })),

      getScrollPosition: (view) => {
        const state = get();
        return state.scrollPositions[view] ?? DEFAULT_SCROLL_POSITION;
      },

      setLastActiveView: (view) => set({ lastActiveView: view }),

      resetScrollPositions: () => set({ scrollPositions: initialState.scrollPositions }),
    }),
    {
      name: 'calendar-scroll-positions',
      storage: platformStorage(),
    },
  ),
);
