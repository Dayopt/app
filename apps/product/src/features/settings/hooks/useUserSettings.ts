/**
 * ユーザー設定のDB連携hook
 * TanStack Queryを使用してSupabaseと同期
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { api } from '@/lib/trpc';

import { useCalendarSettingsStore } from '@/features/calendar/stores/useCalendarSettingsStore';
import type { UserSettings } from '@/features/calendar/stores/userSettings';
import { dispatchUserSettings } from '@/features/calendar/stores/userSettings';
import { useUpdateUserSettings } from '@/lib/hooks/useUpdateUserSettings';

/**
 * ユーザー設定をDBと同期するhook
 * - 初回ロード時: DBから設定を取得してStoreに反映
 * - 設定変更時: DBに保存（debounce済み）
 */
export function useUserSettings() {
  // DBから設定を取得
  const {
    data: dbSettings,
    isPending,
    fetchStatus,
    error,
  } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // networkMode: 'offlineFirst' でオフライン時は fetchStatus === 'paused' になる
  const isPaused = fetchStatus === 'paused';

  const updateMutation = useUpdateUserSettings();
  const [calendarHydrated, setCalendarHydrated] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (dbSettings) {
      dispatchUserSettings({
        showWeekends: dbSettings.showWeekends,
        ...(dbSettings.defaultView && { defaultView: dbSettings.defaultView }),
        ...(dbSettings.hourHeightDensity && { hourHeightDensity: dbSettings.hourHeightDensity }),
      });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- query解決後のCalendar UI state hydration
    setCalendarHydrated(true);
  }, [dbSettings, isPending]);

  // 設定をDBに保存する関数
  const saveSettings = useCallback(
    (settings: Partial<UserSettings>) => {
      // Calendar UI stateはstore、server stateはmutationのquery cacheへ即時反映する。
      if (
        settings.showWeekends !== undefined ||
        settings.defaultView !== undefined ||
        settings.hourHeightDensity !== undefined
      ) {
        dispatchUserSettings(settings);
      }

      // DBに保存用のマッピング
      const dbInput: Record<string, unknown> = {};

      if (settings.timezone !== undefined) dbInput.timezone = settings.timezone;
      if (settings.timeFormat !== undefined) dbInput.timeFormat = settings.timeFormat;
      if (settings.weekStartsOn !== undefined) dbInput.weekStartsOn = settings.weekStartsOn;
      if (settings.showWeekends !== undefined) dbInput.showWeekends = settings.showWeekends;
      if (settings.showWeekNumbers !== undefined)
        dbInput.showWeekNumbers = settings.showWeekNumbers;
      if (settings.defaultDuration !== undefined)
        dbInput.defaultDuration = settings.defaultDuration;
      if (settings.snapInterval !== undefined) dbInput.snapInterval = settings.snapInterval;
      if (settings.defaultView !== undefined) dbInput.defaultView = settings.defaultView;
      if (settings.hourHeightDensity !== undefined)
        dbInput.hourHeightDensity = settings.hourHeightDensity;
      if (Object.keys(dbInput).length > 0) {
        updateMutation.mutate(dbInput);
      }
    },
    [updateMutation],
  );

  const preferences = useUserPreferences();
  const calendarSettings = useCalendarSettingsStore();
  const settings = useMemo<UserSettings>(
    () => ({ ...preferences, ...calendarSettings }),
    [preferences, calendarSettings],
  );

  return {
    settings,
    saveSettings,
    isPending,
    isPaused,
    hydrated: calendarHydrated && error == null,
    isSaving: updateMutation.isPending,
    error,
  };
}
