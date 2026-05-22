import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { DEFAULT_CHRONOTYPE_SETTINGS } from '../lib/defaults';
import type { ChronotypeSettings as ChronotypeSettingsState } from '../types/chronotype';

export interface ChronotypeSettings {
  chronotype: ChronotypeSettingsState | null;
  chronotypeGradient: { light: string | null; dark: string | null };
}

interface ChronotypeSettingsStore extends ChronotypeSettings {
  updateSettings: (settings: Partial<ChronotypeSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: ChronotypeSettings = {
  chronotype: DEFAULT_CHRONOTYPE_SETTINGS,
  chronotypeGradient: { light: null, dark: null },
};

/**
 * Chronotype 設定（生体リズム選択 + 派生 gradient）の Zustand ストア。
 *
 * persist せず、server (user_settings.chronotype_settings) が SoT。
 * `UserSettingsInitializer` が起動時に DB から取得した値を hydrate する。
 */
export const useChronotypeSettingsStore = create<ChronotypeSettingsStore>()(
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
      name: 'chronotype-settings-store',
      enabled: process.env.NODE_ENV !== 'production',
    },
  ),
);
