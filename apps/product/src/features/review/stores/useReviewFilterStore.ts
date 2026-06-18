import { create } from 'zustand';

import { addWeeks } from '@/lib/date/core';

/** Stats の表示粒度 */
export type ReviewGranularity = 'week';

interface ReviewFilterState {
  /** 表示粒度 */
  granularity: ReviewGranularity;
  /** ナビゲーション基準日 */
  currentDate: Date;
  /** 粒度を変更 */
  setGranularity: (granularity: ReviewGranularity) => void;
  /** 基準日を設定 */
  setCurrentDate: (date: Date) => void;
  /** 前後・今日へナビゲーション */
  navigate: (direction: 'prev' | 'next' | 'today') => void;
}

function navigateDate(currentDate: Date, direction: 'prev' | 'next' | 'today'): Date {
  if (direction === 'today') return new Date();

  const delta = direction === 'next' ? 1 : -1;
  return addWeeks(currentDate, delta);
}

/** Stats フィルター状態を管理する Zustand ストア */
export const useReviewFilterStore = create<ReviewFilterState>((set, get) => ({
  granularity: 'week',
  currentDate: new Date(),
  setGranularity: (granularity) => set({ granularity }),
  setCurrentDate: (date) => set({ currentDate: date }),
  navigate: (direction) => {
    const { currentDate } = get();
    set({ currentDate: navigateDate(currentDate, direction) });
  },
}));
