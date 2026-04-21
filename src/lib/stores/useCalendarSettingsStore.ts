import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { CalendarViewType, HourHeightDensity } from '@/lib/calendar-constants';
import { DEFAULT_CHRONOTYPE_SETTINGS } from '@/lib/chronotype-defaults';
import type { ChronotypeSettings as ChronotypeSettingsState } from '@/lib/types/chronotype';

export type { CalendarViewType } from '@/lib/calendar-constants';

/** 日付フォーマットの種別（日本式・米国式・欧州式・ISO式） */
export type DateFormatType = 'yyyy/MM/dd' | 'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';

/** カレンダーの各種設定項目を表すインターフェース */
export interface CalendarSettings {
  // タイムゾーン設定
  timezone: string; // 例: 'Asia/Tokyo', 'America/New_York'

  // 時間表示形式
  timeFormat: '24h' | '12h';

  // 日付表示形式
  dateFormat: DateFormatType; // yyyy/MM/dd（日本）, MM/dd/yyyy（米国）, dd/MM/yyyy（欧州）, yyyy-MM-dd（ISO）

  // デフォルトビュー設定
  defaultView: CalendarViewType; // 起動時のデフォルトビュー

  // その他の設定
  weekStartsOn: 0 | 1 | 6; // 日曜、月曜、土曜
  defaultDuration: number; // デフォルトのタスク時間（分）
  snapInterval: 5 | 10 | 15 | 30; // ドラッグ&ドロップのスナップ間隔（分）
  // 表示設定
  showWeekNumbers: boolean;
  showWeekends: boolean;

  // クロノタイプ設定
  chronotype: ChronotypeSettingsState | null;
  chronotypeGradient: { light: string | null; dark: string | null };

  // 睡眠スケジュール設定
  sleepSchedule: {
    enabled: boolean; // 睡眠時間帯の表示オン/オフ
    bedtime: number; // 就寝時刻（0-23）
    wakeTime: number; // 起床時刻（0-23）
  };

  // グリッド密度
  hourHeightDensity: HourHeightDensity;
}

interface CalendarSettingsStore extends CalendarSettings {
  updateSettings: (settings: Partial<CalendarSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: CalendarSettings = {
  timezone:
    typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  timeFormat: '24h',
  dateFormat: 'yyyy-MM-dd', // ISO 8601（国際標準）
  defaultView: 'week', // デフォルトは週表示
  weekStartsOn: 1, // 月曜始まり
  defaultDuration: 60,
  snapInterval: 15, // デフォルトは15分間隔
  showWeekNumbers: false,
  showWeekends: true, // デフォルトは週末も表示
  chronotype: DEFAULT_CHRONOTYPE_SETTINGS,
  chronotypeGradient: { light: null, dark: null },
  sleepSchedule: {
    enabled: true,
    bedtime: 23,
    wakeTime: 7,
  },
  hourHeightDensity: 'default',
};

/**
 * カレンダー設定を管理する Zustand ストア
 *
 * persist せず、`UserSettingsInitializer` (Providers 直下) が server (user_settings)
 * から取得した値を hydrate する。multi-tab 間の staleness を避けるため、localStorage
 * に独自コピーを保持しない。cold load 時は defaultSettings → TanStack Query の
 * 永続 cache から hydrate される流れでほぼ即時に正しい値になる。
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
