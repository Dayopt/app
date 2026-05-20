import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { CalendarViewType, HourHeightDensity } from '@/lib/calendar-constants';
import { DEFAULT_CHRONOTYPE_SETTINGS } from '@/lib/chronotype-defaults';
import type { ChronotypeSettings as ChronotypeSettingsState } from '@/lib/types/chronotype';

export type { CalendarViewType } from '@/lib/calendar-constants';

/** Calendar 専用の UI 表示設定 */
export interface CalendarSettings {
  // デフォルトビュー設定
  defaultView: CalendarViewType; // 起動時のデフォルトビュー

  // 表示設定
  showWeekends: boolean;

  // グリッド密度
  hourHeightDensity: HourHeightDensity;

  // クロノタイプ設定
  chronotype: ChronotypeSettingsState | null;
  chronotypeGradient: { light: string | null; dark: string | null };
}

interface CalendarSettingsStore extends CalendarSettings {
  updateSettings: (settings: Partial<CalendarSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: CalendarSettings = {
  defaultView: 'week',
  showWeekends: true,
  hourHeightDensity: 'default',
  chronotype: DEFAULT_CHRONOTYPE_SETTINGS,
  chronotypeGradient: { light: null, dark: null },
};

/**
 * Calendar UI 設定を管理する Zustand ストア
 *
 * persist せず、`UserSettingsInitializer` (Providers 直下) が server (user_settings)
 * から取得した値を hydrate する。multi-tab 間の staleness を避けるため、localStorage
 * に独自コピーを保持しない。cold load 時は defaultSettings → TanStack Query の
 * 永続 cache から hydrate される流れでほぼ即時に正しい値になる。
 *
 * app-wide な user preference (timezone / weekStartsOn 等) は `useUserPreferenceStore`
 * に分離されている。
 */
export const useCalendarSettingsStore = create<CalendarSettingsStore>()(
  devtools(
    (set) => ({
      ...defaultSettings,

      updateSettings: (newSettings) =>
        set((state) => ({
          ...state,
          ...newSettings,
        })),

      resetSettings: () => set({ ...defaultSettings }),
    }),
    {
      name: 'calendar-settings-store',
      enabled: process.env.NODE_ENV !== 'production',
    },
  ),
);
