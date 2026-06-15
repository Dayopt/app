/**
 * UserSettings — query-backed `UserPreference` + Calendar UI state の統合型
 *
 * server stateはTanStack Queryが保持し、このdispatcherは移行中のCalendar UI stateだけを更新する。
 */

import type { UserPreference } from '@/lib/hooks/useUserPreferences';
import type { CalendarSettings } from './useCalendarSettingsStore';
import { useCalendarSettingsStore } from './useCalendarSettingsStore';

/** server settingsとCalendar UI settingsを統合した設定オブジェクトの型 */
export type UserSettings = UserPreference & CalendarSettings;

const CALENDAR_SETTINGS_KEYS = [
  'defaultView',
  'showWeekends',
  'hourHeightDensity',
] as const satisfies ReadonlyArray<keyof CalendarSettings>;

function pickCalendarSettings(partial: Partial<UserSettings>): Partial<CalendarSettings> {
  const calendar: Partial<CalendarSettings> = {};
  for (const key of CALENDAR_SETTINGS_KEYS) {
    if (key in partial) {
      (calendar as Record<string, unknown>)[key] = partial[key];
    }
  }

  return calendar;
}

/**
 * Calendar UI stateだけを即時反映する。server stateはmutationのquery cache更新が担当する。
 */
export function dispatchUserSettings(partial: Partial<UserSettings>): void {
  const calendar = pickCalendarSettings(partial);
  if (Object.keys(calendar).length > 0) {
    useCalendarSettingsStore.getState().updateSettings(calendar);
  }
}
