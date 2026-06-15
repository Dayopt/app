'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { useCallback } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api, type AppRouter } from '@/lib/trpc';

export type DateFormatType = 'yyyy/MM/dd' | 'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';

export interface UserPreference {
  timezone: string;
  timeFormat: '24h' | '12h';
  dateFormat: DateFormatType;
  weekStartsOn: 0 | 1 | 6;
  showWeekNumbers: boolean;
  defaultDuration: number;
  snapInterval: 5 | 10 | 15 | 30;
}

type UserSettingsData = inferRouterOutputs<AppRouter>['userSettings']['get'];

function getBrowserTimezone(): string {
  return typeof window === 'undefined' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function toUserPreferences(settings: UserSettingsData | undefined): UserPreference {
  if (!settings) {
    return {
      timezone: getBrowserTimezone(),
      timeFormat: '24h',
      dateFormat: 'yyyy-MM-dd',
      weekStartsOn: 1,
      showWeekNumbers: false,
      defaultDuration: 60,
      snapInterval: 15,
    };
  }

  return {
    timezone: settings.timezone,
    timeFormat: settings.timeFormat,
    dateFormat: settings.preferredLocale === 'ja' ? 'yyyy/MM/dd' : 'MM/dd/yyyy',
    weekStartsOn: settings.weekStartsOn,
    showWeekNumbers: settings.showWeekNumbers,
    defaultDuration: settings.defaultDuration,
    snapInterval: settings.snapInterval,
  };
}

/** user_settings query cacheをapp-wideな表示設定へ写像する。 */
export function useUserPreferences<T = UserPreference>(
  selector?: (preferences: UserPreference) => T,
): T {
  const selectPreferences = useCallback(
    (settings: UserSettingsData) => {
      const preferences = toUserPreferences(settings);
      return selector ? selector(preferences) : (preferences as T);
    },
    [selector],
  );
  const { data } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    select: selectPreferences,
  });
  if (data !== undefined) return data as T;

  const fallback = toUserPreferences(undefined);
  return selector ? selector(fallback) : (fallback as T);
}
