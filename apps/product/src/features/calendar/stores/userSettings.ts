/**
 * UserSettings — `UserPreference` + `CalendarSettings` を統合した型と dispatcher
 *
 * 2 ストアに跨る設定変更（例: `display-settings.tsx` の `saveSettings({ timezone, defaultView })`）
 * を扱うためのユーティリティ。callsite はこの型 / dispatch を経由することで、
 * 各 store の責務境界を保ったまま 1 度の呼び出しで両方の state を更新できる。
 */

import type { UserPreference } from '@/lib/stores/useUserPreferenceStore';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import type { CalendarSettings } from './useCalendarSettingsStore';
import { useCalendarSettingsStore } from './useCalendarSettingsStore';

/** 2 ストアを統合した設定オブジェクトの型 */
export type UserSettings = UserPreference & CalendarSettings;

const USER_PREFERENCE_KEYS = [
  'timezone',
  'timeFormat',
  'dateFormat',
  'weekStartsOn',
  'showWeekNumbers',
  'defaultDuration',
  'snapInterval',
] as const satisfies ReadonlyArray<keyof UserPreference>;

const CALENDAR_SETTINGS_KEYS = [
  'defaultView',
  'showWeekends',
  'hourHeightDensity',
  'chronotype',
  'chronotypeGradient',
] as const satisfies ReadonlyArray<keyof CalendarSettings>;

/** 統合 partial を 2 ストアに振り分ける純粋ユーティリティ（テスト/外部用途向け） */
export function splitUserSettings(partial: Partial<UserSettings>): {
  preference: Partial<UserPreference>;
  calendar: Partial<CalendarSettings>;
} {
  const preference: Partial<UserPreference> = {};
  const calendar: Partial<CalendarSettings> = {};

  for (const key of USER_PREFERENCE_KEYS) {
    if (key in partial) {
      (preference as Record<string, unknown>)[key] = partial[key];
    }
  }
  for (const key of CALENDAR_SETTINGS_KEYS) {
    if (key in partial) {
      (calendar as Record<string, unknown>)[key] = partial[key];
    }
  }

  return { preference, calendar };
}

/**
 * 統合 partial を 2 ストアに dispatch する。
 *
 * 既存の `useCalendarSettingsStore.updateSettings({...})` 1 本だった更新を、
 * UserPreference / CalendarSettings のどちらに属するかで振り分ける。
 */
export function dispatchUserSettings(partial: Partial<UserSettings>): void {
  const { preference, calendar } = splitUserSettings(partial);

  if (Object.keys(preference).length > 0) {
    useUserPreferenceStore.getState().updatePreferences(preference);
  }
  if (Object.keys(calendar).length > 0) {
    useCalendarSettingsStore.getState().updateSettings(calendar);
  }
}
