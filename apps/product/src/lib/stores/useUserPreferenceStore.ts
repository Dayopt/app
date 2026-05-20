import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/** 日付フォーマットの種別（日本式・米国式・欧州式・ISO式） */
export type DateFormatType = 'yyyy/MM/dd' | 'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';

/**
 * app-wide なユーザー嗜好（locale / 表示形式 / 入力既定値）
 *
 * Calendar feature に閉じない、複数 feature が参照する設定をここに集約する。
 * `useCalendarSettingsStore` には Calendar UI 専用の state のみを残す。
 */
export interface UserPreference {
  /** タイムゾーン（例: 'Asia/Tokyo'） */
  timezone: string;
  /** 時刻表示形式 */
  timeFormat: '24h' | '12h';
  /** 日付表示形式 */
  dateFormat: DateFormatType;
  /** 週の開始曜日（0: 日曜, 1: 月曜, 6: 土曜） */
  weekStartsOn: 0 | 1 | 6;
  /** 週番号を表示するか（calendar grid / mini calendar 共通） */
  showWeekNumbers: boolean;
  /** 新規ブロックの既定の長さ（分） */
  defaultDuration: number;
  /** ドラッグ&ドロップのスナップ間隔（分） */
  snapInterval: 5 | 10 | 15 | 30;
}

interface UserPreferenceStore extends UserPreference {
  updatePreferences: (preferences: Partial<UserPreference>) => void;
  resetPreferences: () => void;
}

const defaultPreferences: UserPreference = {
  timezone:
    typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  timeFormat: '24h',
  dateFormat: 'yyyy-MM-dd',
  weekStartsOn: 1,
  showWeekNumbers: false,
  defaultDuration: 60,
  snapInterval: 15,
};

/**
 * ユーザー嗜好を管理する Zustand ストア
 *
 * persist せず、`UserSettingsInitializer` (Providers 直下) が server (user_settings)
 * から取得した値を hydrate する。multi-tab 間の staleness を避けるため、localStorage
 * に独自コピーを保持しない。
 */
export const useUserPreferenceStore = create<UserPreferenceStore>()(
  devtools(
    (set) => ({
      ...defaultPreferences,

      updatePreferences: (newPreferences) =>
        set((state) => ({
          ...state,
          ...newPreferences,
        })),

      resetPreferences: () => set({ ...defaultPreferences }),
    }),
    {
      name: 'user-preference-store',
      enabled: process.env.NODE_ENV !== 'production',
    },
  ),
);
