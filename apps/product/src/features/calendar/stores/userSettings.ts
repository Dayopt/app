/**
 * UserSettings — `UserPreference` + `CalendarSettings` + `ChronotypeSettings` を統合した型と dispatcher
 *
 * 3 ストアに跨る設定変更（例: `useUserSettings.saveSettings({ timezone, defaultView, chronotype })`）
 * を扱うためのユーティリティ。callsite はこの型 / dispatch を経由することで、
 * 各 store の責務境界を保ったまま 1 度の呼び出しで複数 store の state を更新できる。
 */

import { type ChronotypeSettings, useChronotypeSettingsStore } from '@/features/chronotype';
import type { UserPreference } from '@/lib/stores/useUserPreferenceStore';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import type { CalendarSettings } from './useCalendarSettingsStore';
import { useCalendarSettingsStore } from './useCalendarSettingsStore';

/** 3 ストアを統合した設定オブジェクトの型 */
export type UserSettings = UserPreference & CalendarSettings & ChronotypeSettings;

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
] as const satisfies ReadonlyArray<keyof CalendarSettings>;

const CHRONOTYPE_SETTINGS_KEYS = [
  'chronotype',
  'chronotypeGradient',
] as const satisfies ReadonlyArray<keyof ChronotypeSettings>;

/** 統合 partial を 3 ストアに振り分ける純粋ユーティリティ（テスト/外部用途向け） */
function splitUserSettings(partial: Partial<UserSettings>): {
  preference: Partial<UserPreference>;
  calendar: Partial<CalendarSettings>;
  chronotype: Partial<ChronotypeSettings>;
} {
  const preference: Partial<UserPreference> = {};
  const calendar: Partial<CalendarSettings> = {};
  const chronotype: Partial<ChronotypeSettings> = {};

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
  for (const key of CHRONOTYPE_SETTINGS_KEYS) {
    if (key in partial) {
      (chronotype as Record<string, unknown>)[key] = partial[key];
    }
  }

  return { preference, calendar, chronotype };
}

/**
 * 統合 partial を 3 ストアに dispatch する。
 *
 * 既存の `useCalendarSettingsStore.updateSettings({...})` 1 本だった更新を、
 * UserPreference / CalendarSettings / ChronotypeSettings のどれに属するかで振り分ける。
 */
export function dispatchUserSettings(partial: Partial<UserSettings>): void {
  const { preference, calendar, chronotype } = splitUserSettings(partial);

  if (Object.keys(preference).length > 0) {
    useUserPreferenceStore.getState().updatePreferences(preference);
  }
  if (Object.keys(calendar).length > 0) {
    useCalendarSettingsStore.getState().updateSettings(calendar);
  }
  if (Object.keys(chronotype).length > 0) {
    useChronotypeSettingsStore.getState().updateSettings(chronotype);
  }
}
