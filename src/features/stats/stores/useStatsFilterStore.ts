import { create } from 'zustand';

import { addDays, addMonths, addWeeks } from '@/lib/date/core';

/** Stats のタブ */
export type StatsTab = 'review' | 'progress' | 'insights';

/** Stats の表示粒度 */
export type StatsGranularity = 'day' | 'week' | 'month' | 'year';

interface StatsFilterState {
  /** アクティブタブ */
  tab: StatsTab;
  /** 表示粒度 */
  granularity: StatsGranularity;
  /** ナビゲーション基準日 */
  currentDate: Date;
  /** タブを変更 */
  setTab: (tab: StatsTab) => void;
  /** 粒度を変更 */
  setGranularity: (granularity: StatsGranularity) => void;
  /** 基準日を設定 */
  setCurrentDate: (date: Date) => void;
  /** 前後・今日へナビゲーション */
  navigate: (direction: 'prev' | 'next' | 'today') => void;
}

function navigateDate(
  currentDate: Date,
  granularity: StatsGranularity,
  direction: 'prev' | 'next' | 'today',
): Date {
  if (direction === 'today') return new Date();

  const delta = direction === 'next' ? 1 : -1;

  switch (granularity) {
    case 'day':
      return addDays(currentDate, delta);
    case 'week':
      return addWeeks(currentDate, delta);
    case 'month':
      return addMonths(currentDate, delta);
    case 'year': {
      const result = new Date(currentDate);
      result.setFullYear(result.getFullYear() + delta);
      return result;
    }
  }
}

/** Stats フィルター状態を管理する Zustand ストア */
export const useStatsFilterStore = create<StatsFilterState>((set, get) => ({
  tab: 'review',
  granularity: 'week',
  currentDate: new Date(),
  setTab: (tab) => set({ tab }),
  setGranularity: (granularity) => set({ granularity }),
  setCurrentDate: (date) => set({ currentDate: date }),
  navigate: (direction) => {
    const { currentDate, granularity } = get();
    set({ currentDate: navigateDate(currentDate, granularity, direction) });
  },
}));
