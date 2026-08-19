import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { addWeeks } from '@/lib/date/core';

/** Review の表示粒度 */
export type ReviewGranularity = 'day' | 'week';

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

/**
 * Review フィルター状態を管理する Zustand ストア。
 * currentDate は Calendar URL / Context の一時ミラーなので永続化しない。
 */
export const useReviewFilterStore = create<ReviewFilterState>()(
  devtools(
    (set, get) => ({
      granularity: 'week',
      currentDate: new Date(),
      setGranularity: (granularity) => set({ granularity }),
      setCurrentDate: (date) => set({ currentDate: date }),
      navigate: (direction) => {
        const { currentDate } = get();
        set({ currentDate: navigateDate(currentDate, direction) });
      },
    }),
    { name: 'review-filter-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
