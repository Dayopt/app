/**
 * Calendar 2レーン表示のモード state（Step 5）
 *
 * overview.md §4 の密度対応方針:
 * - Day: 素直に 2 レーン（state 不要、常時表示）
 * - Week「予定+記録」: Plan を細レーンで表示（state 不要、固定レイアウト）
 * - モバイル Week: 幅が足りないため「予定だけ / 記録だけ」の表示切替が必要
 *
 * そのため永続化が必要な state はモバイル Week の表示切替 1 つだけ。
 * `useCalendarFilterStore` と同じ persist パターン（localStorage）を踏襲する。
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { platformStorage } from '@/lib/zustand/storage';

type MobileWeekDisplayMode = 'planned' | 'recorded';

interface CalendarDisplayModeState {
  /** モバイル Week 表示で「予定だけ」か「記録だけ」か */
  mobileWeekDisplayMode: MobileWeekDisplayMode;
}

interface CalendarDisplayModeActions {
  setMobileWeekDisplayMode: (mode: MobileWeekDisplayMode) => void;
}

type CalendarDisplayModeStore = CalendarDisplayModeState & CalendarDisplayModeActions;

export function migrateCalendarDisplayModeState(
  persistedState: unknown,
  version: number,
): CalendarDisplayModeState {
  const mobileWeekDisplayMode =
    typeof persistedState === 'object' && persistedState !== null
      ? Reflect.get(persistedState, 'mobileWeekDisplayMode')
      : undefined;

  if (version < 2 && mobileWeekDisplayMode === 'logged') {
    return { mobileWeekDisplayMode: 'recorded' };
  }

  return {
    mobileWeekDisplayMode: mobileWeekDisplayMode === 'planned' ? 'planned' : 'recorded',
  };
}

/** Calendar 2レーン表示のモバイル Week 表示切替を管理する Zustand ストア（localStorage 永続化） */
export const useCalendarDisplayModeStore = create<CalendarDisplayModeStore>()(
  devtools(
    persist<CalendarDisplayModeStore, [], [], CalendarDisplayModeState>(
      (set) => ({
        mobileWeekDisplayMode: 'recorded',
        setMobileWeekDisplayMode: (mode) => set({ mobileWeekDisplayMode: mode }),
      }),
      {
        name: 'calendar-display-mode-storage',
        version: 2,
        storage: platformStorage<CalendarDisplayModeState>(),
        partialize: ({ mobileWeekDisplayMode }) => ({ mobileWeekDisplayMode }),
        migrate: migrateCalendarDisplayModeState,
      },
    ),
    { name: 'calendar-display-mode-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
