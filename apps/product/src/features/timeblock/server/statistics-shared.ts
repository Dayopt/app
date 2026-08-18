import type { SupabaseClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import type { Database } from '@/lib/database';
import { logger } from '@/lib/logger';
import { captureUnexpectedDatabaseError, captureUnexpectedError } from '@/lib/sentry';
import { getOriginalError, isExpectedTrpcError } from '@/lib/trpc/errors';

export function getTodayInTimezone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

export async function getUserTimezone(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      feature: 'statistics',
      operation: 'get_user_timezone',
    });
  }
  return (data?.timezone as string | null | undefined) ?? 'UTC';
}

export function handleStatsError(operation: string, error: unknown): never {
  if (error instanceof TRPCError) {
    if (!isExpectedTrpcError(error)) {
      captureUnexpectedError(getOriginalError(error), {
        feature: 'statistics',
        source: 'statistics_router',
        operation,
      });
    }
    throw error;
  }

  const unexpectedError = error instanceof Error ? error : new Error('Unknown statistics error');
  captureUnexpectedError(unexpectedError, {
    feature: 'statistics',
    source: 'statistics_router',
    operation,
  });
  logger.error(`Statistics ${operation} failed`, {
    errorType: unexpectedError.name,
  });

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to fetch statistics (${operation})`,
    cause: unexpectedError,
  });
}

export const dateRangeInput = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export interface StatsPageData {
  overview: {
    totalMinutes: number;
    recordCount: number;
    totalEntries: number;
    plannedEntries: number;
    planRate: number;
  };
  prevOverview: {
    totalMinutes: number;
    recordCount: number;
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
    tagId: string | null;
    name: string | null;
    color: string | null;
    hours: number;
    isUncategorized: boolean;
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
    recordCount: number;
  }>;
  estimationAccuracy: Array<{
    tagId: string | null;
    tagName: string | null;
    tagColor: string | null;
    isUncategorized: boolean;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    recordCount: number;
  }>;
  prevEstimationAccuracy: Array<{
    tagId: string | null;
    tagName: string | null;
    tagColor: string | null;
    isUncategorized: boolean;
    avgPlannedMinutes: number;
    avgActualMinutes: number;
    avgDeviationMinutes: number;
    recordCount: number;
  }>;
  prevEnergyMap: Array<{
    hour: number;
    dow: number;
    totalMinutes: number;
    recordCount: number;
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

/**
 * Time P/L のレスポンス型。旧タグ軸から移行（#2162）。
 *
 * 色・アイコンはカテゴリー由来（アクティビティ自身は持たず継承する）。
 */
export interface TimePLResponse {
  activities: Array<{
    activityId: string | null;
    activityName: string | null;
    categoryColor: string | null;
    categoryIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
    isNoActivity: boolean;
  }>;
  prevActivities: Array<{
    activityId: string | null;
    activityName: string | null;
    categoryColor: string | null;
    categoryIcon: string | null;
    budgetMinutes: number;
    actualMinutes: number;
    isPlanned: boolean;
    isNoActivity: boolean;
  }>;
  availableMinutes: number;
}
