'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { useCallback } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api, type AppRouter } from '@/lib/trpc';

import type { CalendarViewType, HourHeightDensity } from '../lib/constants';

export interface CalendarSettings {
  defaultView: CalendarViewType;
  showWeekends: boolean;
  hourHeightDensity: HourHeightDensity;
}

type UserSettingsData = inferRouterOutputs<AppRouter>['userSettings']['get'];

export function toCalendarSettings(settings: UserSettingsData | undefined): CalendarSettings {
  return {
    defaultView: settings?.defaultView ?? 'week',
    showWeekends: settings?.showWeekends ?? true,
    hourHeightDensity: settings?.hourHeightDensity ?? 'default',
  };
}

/** Calendar固有のserver settingsをuserSettings query cacheから取得する。 */
export function useCalendarSettings<T = CalendarSettings>(
  selector?: (settings: CalendarSettings) => T,
): T {
  const selectSettings = useCallback(
    (settings: UserSettingsData) => {
      const calendarSettings = toCalendarSettings(settings);
      return selector ? selector(calendarSettings) : (calendarSettings as T);
    },
    [selector],
  );
  const { data } = api.userSettings.get.useQuery(undefined, {
    staleTime: CACHE_5_MINUTES,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    select: selectSettings,
  });
  if (data !== undefined) return data as T;

  const fallback = toCalendarSettings(undefined);
  return selector ? selector(fallback) : (fallback as T);
}
