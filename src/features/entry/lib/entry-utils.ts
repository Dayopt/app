/**
 * Shared Router Utilities
 * Helper functions for router operations
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { tzIsSameDay } from '@/lib/date/timezone';
import { logger } from '@/lib/logger';

/**
 * Remove undefined fields from an object (for exactOptionalPropertyTypes)
 */
export function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Normalize date-time consistency for entries
 *
 * Rules:
 * 1. Same-day entries: start_time and end_time must be on the same day in user TZ
 * 2. Midnight crossing (end_time on next day in user TZ): cap end_time at 23:59:59 of start_time's date
 * 3. If end_time is before start_time after normalization, set end_time = start_time
 *
 * @param timezone - ユーザーのタイムゾーン（デフォルト: 'UTC'）
 * @returns 'capped' if end_time was capped at 23:59:59 due to midnight crossing, undefined otherwise
 */
export function normalizeDateTimeConsistency(
  data: {
    start_time?: string | null;
    end_time?: string | null;
  },
  timezone = 'UTC',
): 'capped' | undefined {
  // Only process if both start_time and end_time exist
  if (!data.start_time || !data.end_time) {
    return undefined;
  }

  const startDate = new Date(data.start_time);
  const endDate = new Date(data.end_time);

  const endAfterStart = endDate.getTime() >= startDate.getTime();

  // ユーザーTZで同日かどうかを判定
  const datesMatch = tzIsSameDay(startDate, endDate, timezone);

  // Consistency check: skip if already consistent
  if (datesMatch && endAfterStart) {
    return undefined;
  }

  logger.debug('[normalizeDateTimeConsistency] Inconsistency detected - normalizing');

  let result: 'capped' | undefined;

  // 1. Midnight crossing: end_time is on a different (later) date in user TZ
  //    Cap at 23:59:59.999 of start_time's date instead of creating a zero-duration block
  if (!datesMatch && endAfterStart) {
    const startDateStr = formatInTimeZone(startDate, timezone, 'yyyy-MM-dd');
    const cappedEnd = fromZonedTime(new Date(`${startDateStr}T23:59:59.999`), timezone);
    data.end_time = cappedEnd.toISOString();
    result = 'capped';
    logger.debug('[normalizeDateTimeConsistency] Midnight crossing - capped end_time to 23:59:59');
    return result;
  }

  // 2. ユーザーTZで日付が異なる（後退している）場合: end_time の日付を start_time の日付に合わせる
  if (!datesMatch) {
    const startDateStr = formatInTimeZone(startDate, timezone, 'yyyy-MM-dd');
    const endTimeStr = formatInTimeZone(endDate, timezone, 'HH:mm:ss.SSS');
    const newEndDate = fromZonedTime(new Date(`${startDateStr}T${endTimeStr}`), timezone);
    data.end_time = newEndDate.toISOString();
  }

  // 3. If end_time is before start_time, set to same time as start_time
  const finalEndDate = new Date(data.end_time);
  if (finalEndDate.getTime() < startDate.getTime()) {
    data.end_time = startDate.toISOString();
  }

  return result;
}
