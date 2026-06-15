/**
 * ユーザー設定のDB連携hook
 * TanStack Queryを使用してSupabaseと同期
 */

import { useCallback, useMemo } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { api } from '@/lib/trpc';

import { useCalendarSettings } from '@/features/calendar/hooks/useCalendarSettings';
import type { UserSettings } from '@/features/calendar/stores/userSettings';
import { useUpdateUserSettings } from '@/lib/hooks/useUpdateUserSettings';

/**
 * ユーザー設定をDBと同期するhook
 * user_settings query cacheを参照し、設定変更をoptimistic mutationで保存する。
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

  // 設定をDBに保存する関数
  const saveSettings = useCallback(
    (settings: Partial<UserSettings>) => {
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
  const calendarSettings = useCalendarSettings();
  const settings = useMemo<UserSettings>(
    () => ({ ...preferences, ...calendarSettings }),
    [preferences, calendarSettings],
  );

  return {
    settings,
    saveSettings,
    isPending,
    isPaused,
    hydrated: !isPending && error == null && dbSettings !== undefined,
    isSaving: updateMutation.isPending,
    error,
  };
}
