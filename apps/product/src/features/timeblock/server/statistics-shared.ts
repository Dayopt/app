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
