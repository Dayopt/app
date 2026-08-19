import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { addDays } from '@/lib/date';

interface TimeblockDayDiffBounds {
  dayStart: Date;
  dayEnd: Date;
}

/** 指定日のタイムゾーン日境界（00:00〜翌日00:00）を UTC の Date で返す。 */
export function resolveTimeblockDayDiffBounds(
  date: Date,
  timezone: string,
): TimeblockDayDiffBounds {
  const dayKey = formatInTimeZone(date, timezone, 'yyyy-MM-dd');
  const zonedDayStart = new Date(`${dayKey}T00:00:00`);
  return {
    dayStart: fromZonedTime(zonedDayStart, timezone),
    dayEnd: fromZonedTime(addDays(zonedDayStart, 1), timezone),
  };
}

/** 開始日〜終了日（両端含む）のタイムゾーン境界を UTC の Date で返す。 */
export function resolveTimeblockRangeDiffBounds(
  startDate: Date,
  endDate: Date,
  timezone: string,
): TimeblockDayDiffBounds {
  return {
    dayStart: resolveTimeblockDayDiffBounds(startDate, timezone).dayStart,
    dayEnd: resolveTimeblockDayDiffBounds(endDate, timezone).dayEnd,
  };
}
