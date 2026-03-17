import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import type { CalendarViewType, HourHeightDensity } from '@/lib/calendar-constants';
import { DEFAULT_CHRONOTYPE_SETTINGS } from '@/lib/chronotype-defaults';
import { listenToTimezoneChange } from '@/lib/timezone-listener';
import type { ChronotypeSettings as ChronotypeSettingsState } from '@/types/chronotype';

export type { CalendarViewType } from '@/lib/calendar-constants';

// 日付フォーマット型
export type DateFormatType = 'yyyy/MM/dd' | 'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';

export interface CalendarSettings {
  // タイムゾーン設定
  timezone: string; // 例: 'Asia/Tokyo', 'America/New_York'
  showUTCOffset: boolean; // UTC表示のON/OFF

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
  chronotype: ChronotypeSettingsState;

  // Plan/Record表示設定
  planRecordMode: 'plan' | 'record' | 'both';

  // 睡眠スケジュール設定
  sleepSchedule: {
    enabled: boolean; // 睡眠時間帯の表示オン/オフ
    bedtime: number; // 就寝時刻（0-23）
    wakeTime: number; // 起床時刻（0-23）
  };

  // グリッド密度
  hourHeightDensity: HourHeightDensity;
}

/**
 * セッション中のみ有効な一時的なオーバーライド
 * ヘッダーのViewSwitcherやキーボードショートカットで変更される
 * リロード時にリセットされ、Settingsで設定したデフォルト値に戻る
 */
export interface SessionOverrides {
  showWeekends?: boolean;
  showWeekNumbers?: boolean;
  hourHeightDensity?: HourHeightDensity;
}

interface CalendarSettingsStore extends CalendarSettings {
  sessionOverrides: SessionOverrides;
  updateSettings: (settings: Partial<CalendarSettings>) => void;
  updateSessionOverride: (overrides: Partial<SessionOverrides>) => void;
  resetSettings: () => void;
}

const defaultSettings: CalendarSettings = {
  timezone: 'Asia/Tokyo', // デフォルトはJST、useEffectで実際の値に更新
  showUTCOffset: true,
  timeFormat: '24h',
  dateFormat: 'yyyy/MM/dd', // デフォルトは日本式
  defaultView: 'week', // デフォルトは週表示
  weekStartsOn: 1, // 月曜始まり
  defaultDuration: 60,
  snapInterval: 15, // デフォルトは15分間隔
  showWeekNumbers: false,
  showWeekends: true, // デフォルトは週末も表示
  chronotype: { ...DEFAULT_CHRONOTYPE_SETTINGS },
  planRecordMode: 'both',
  sleepSchedule: {
    enabled: true,
    bedtime: 23,
    wakeTime: 7,
  },
  hourHeightDensity: 'default',
};

export const useCalendarSettingsStore = create<CalendarSettingsStore>()(
  devtools(
    persist(
      (set, get) => {
        // タイムゾーン変更リスナーをセットアップ
        if (typeof window !== 'undefined') {
          listenToTimezoneChange((newTimezone) => {
            const currentState = get();
            if (currentState.timezone !== newTimezone) {
              set({ ...currentState, timezone: newTimezone });
            }
          });

          // クリーンアップ関数は保存されない（Zustandの制約）
          // 必要に応じて手動でクリーンアップ
        }

        return {
          ...defaultSettings,
          sessionOverrides: {},

          updateSettings: (newSettings) =>
            set((state) => ({
              ...state,
              ...newSettings,
            })),

          updateSessionOverride: (overrides) =>
            set((state) => ({
              sessionOverrides: { ...state.sessionOverrides, ...overrides },
            })),

          resetSettings: () => set({ ...defaultSettings, sessionOverrides: {} }),
        };
      },
      {
        name: 'calendar-settings',
        partialize: (state) => {
          // sessionOverrides はリロード時にリセットするため永続化しない
          const {
            sessionOverrides: _session,
            updateSettings: _u,
            updateSessionOverride: _us,
            resetSettings: _r,
            ...persisted
          } = state;
          return persisted;
        },
      },
    ),
    {
      name: 'calendar-settings-store',
    },
  ),
);
