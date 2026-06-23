import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import type { Database } from '@/lib/database';
import { logger } from '@/lib/logger';

export function getTodayInTimezone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

export async function getUserTimezone(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from('user_settings')
    .select('timezone')
    .eq('user_id', userId)
    .single();
  return (data?.timezone as string | null | undefined) ?? 'UTC';
}

type StripUndefinedValues<T> = { [K in keyof T]: Exclude<T[K], undefined> };
export function stripUndefined<T extends Record<string, unknown>>(obj: T): StripUndefinedValues<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as never;
}

export function handleStatsError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) {
    Sentry.captureException(error.cause ?? error, {
      tags: { source: 'statistics_router', operation },
    });
    throw error;
  }

  Sentry.captureException(error, {
    tags: { source: 'statistics_router', operation },
  });
  logger.error(`Statistics ${operation} failed`, {
    error: error instanceof Error ? error.message : String(error),
  });

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to fetch statistics (${operation}): ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

export const dateRangeInput = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export interface StatsPageData {
  overview: {
    totalMinutes: number;
    entryCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  prevOverview: {
    totalMinutes: number;
    entryCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  contextSwitches: {
    totalSwitches: number;
    avgPerDay: number;
  };
  blankRate: {
    availableMinutes: number;
    scheduledMinutes: number;
    blankRate: number;
  };
  timeByTag: Array<{
    tagId: string;
    name: string;
    color: string;
    hours: number;
  }>;
  hourly: Array<{
    hour: number;
    totalMinutes: number;
  }>;
  dow: Array<{
    dow: number;
    totalMinutes: number;
  }>;
  energyMap: Array<{
    hour: number;
    dow: number;
    totalMinutes: number;
    entryCount: number;
  }>;
  estimationAccuracy: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    entryCount: number;
  }>;
  prevEstimationAccuracy: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    entryCount: number;
  }>;
  prevEnergyMap: Array<{
    hour: number;
    dow: number;
    totalMinutes: number;
    entryCount: number;
  }>;
  dailyHours: Array<{
    day: string;
    hours: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    hours: number;
  }>;
}

/** get_time_pl_data DB関数のレスポンス型 */
export interface TimePLResponse {
  tags: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    tagIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
  }>;
  prevTags: Array<{
    tagId: string;
    tagName: string;
    tagColor: string;
    tagIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
  }>;
  availableMinutes: number;
}
