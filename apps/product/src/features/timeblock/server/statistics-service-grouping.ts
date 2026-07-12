/**
 * Step 4 統計 TS service (`statistics-service.ts`) が使う TZ-aware なグルーピング層。
 *
 * `plans` / `logs` の生行（snake_case, start_at/end_at）を、既存 domain 層の
 * `aggregate*` 関数が受け取れる RPC 互換の bucket shape（`{hour, total_minutes}` 等）
 * に変換する。TZ 変換をここに閉じ込め、domain 層は TZ 非依存を維持する
 * （`monthly-trend.ts` の既存コメント方針を踏襲）。
 *
 * PL/pgSQL 側の対応関数（比較対象）:
 * - groupMinutesByHour   → get_hourly_distribution
 * - groupMinutesByDow    → get_dow_distribution
 * - groupHoursByDay      → get_daily_hours
 * - groupHoursByMonth    → get_monthly_hours
 * - computeBlankRate     → get_blank_rate
 * - computeContextSwitches → get_stats_kpi_summary / get_stats_page_data の contextSwitches CTE
 * - groupEnergyMap       → get_stats_page_data の energy_map CTE
 */

import { formatInTimeZone } from 'date-fns-tz';

interface TimeRangeRow {
  start_at: string;
  end_at: string;
}

interface TagTimeRangeRow extends TimeRangeRow {
  tag_id: string | null;
}

interface FulfillmentTimeRangeRow extends TimeRangeRow {
  fulfillment_score: number | null;
}

/** 分単位の所要時間（丸めなし）。 */
export function minutesBetween(startAt: string, endAt: string): number {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** `get_hourly_distribution` 相当: 時間帯別合計分（1 桁丸め）。 */
export function groupMinutesByHour(
  rows: ReadonlyArray<TimeRangeRow>,
  timezone: string,
): Array<{ hour: number; total_minutes: number }> {
  const totals = new Map<number, number>();
  for (const row of rows) {
    const hour = Number(formatInTimeZone(new Date(row.start_at), timezone, 'H'));
    totals.set(hour, (totals.get(hour) ?? 0) + minutesBetween(row.start_at, row.end_at));
  }
  return Array.from(totals.entries()).map(([hour, total]) => ({
    hour,
    total_minutes: roundTo(total, 1),
  }));
}

/** `get_dow_distribution` 相当: 曜日別合計分（1 桁丸め、0=日 6=土）。 */
export function groupMinutesByDow(
  rows: ReadonlyArray<TimeRangeRow>,
  timezone: string,
): Array<{ dow: number; total_minutes: number }> {
  const totals = new Map<number, number>();
  for (const row of rows) {
    const dow = Number(formatInTimeZone(new Date(row.start_at), timezone, 'i')) % 7; // 'i'=1(月)-7(日) → 0(日)-6(土)
    totals.set(dow, (totals.get(dow) ?? 0) + minutesBetween(row.start_at, row.end_at));
  }
  return Array.from(totals.entries()).map(([dow, total]) => ({
    dow,
    total_minutes: roundTo(total, 1),
  }));
}

/** `get_daily_hours` 相当: 日別合計時間（2 桁丸め）。呼び出し側で対象年に絞り込み済みの行を渡す。 */
export function groupHoursByDay(
  rows: ReadonlyArray<TimeRangeRow>,
  timezone: string,
): Array<{ day: string; hours: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const day = formatInTimeZone(new Date(row.start_at), timezone, 'yyyy-MM-dd');
    totals.set(day, (totals.get(day) ?? 0) + minutesBetween(row.start_at, row.end_at) / 60);
  }
  return Array.from(totals.entries())
    .map(([day, hours]) => ({ day, hours: roundTo(hours, 2) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** `get_monthly_hours` 相当: 月別合計時間（2 桁丸め）。呼び出し側で開始月以降に絞り込み済みの行を渡す。 */
export function groupHoursByMonth(
  rows: ReadonlyArray<TimeRangeRow>,
  timezone: string,
): Array<{ month: string; hours: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const month = formatInTimeZone(new Date(row.start_at), timezone, 'yyyy-MM');
    totals.set(month, (totals.get(month) ?? 0) + minutesBetween(row.start_at, row.end_at) / 60);
  }
  return Array.from(totals.entries())
    .map(([month, hours]) => ({ month, hours: roundTo(hours, 2) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** `get_stats_page_data` の energy_map CTE 相当: (hour, dow) 別の平均充足度・合計分・件数。 */
export function groupEnergyMap(
  rows: ReadonlyArray<FulfillmentTimeRangeRow>,
  timezone: string,
): Array<{
  hour: number;
  dow: number;
  totalMinutes: number;
  entryCount: number;
  avgFulfillment: number | null;
}> {
  interface Bucket {
    hour: number;
    dow: number;
    totalMinutes: number;
    entryCount: number;
    fulfillmentSum: number;
    fulfillmentCount: number;
  }
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const date = new Date(row.start_at);
    const hour = Number(formatInTimeZone(date, timezone, 'H'));
    const dow = Number(formatInTimeZone(date, timezone, 'i')) % 7;
    const key = `${hour}-${dow}`;
    const bucket = buckets.get(key) ?? {
      hour,
      dow,
      totalMinutes: 0,
      entryCount: 0,
      fulfillmentSum: 0,
      fulfillmentCount: 0,
    };
    bucket.totalMinutes += minutesBetween(row.start_at, row.end_at);
    bucket.entryCount += 1;
    if (row.fulfillment_score != null) {
      bucket.fulfillmentSum += row.fulfillment_score;
      bucket.fulfillmentCount += 1;
    }
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).map((bucket) => ({
    hour: bucket.hour,
    dow: bucket.dow,
    totalMinutes: bucket.totalMinutes,
    entryCount: bucket.entryCount,
    avgFulfillment:
      bucket.fulfillmentCount > 0 ? bucket.fulfillmentSum / bucket.fulfillmentCount : null,
  }));
}

/** `get_stats_kpi_summary` / `get_stats_page_data` の contextSwitches CTE 相当。 */
export function computeContextSwitches(
  rows: ReadonlyArray<TagTimeRangeRow>,
  timezone: string,
): { totalSwitches: number; avgPerDay: number } {
  const byDay = new Map<string, TagTimeRangeRow[]>();
  for (const row of rows) {
    const day = formatInTimeZone(new Date(row.start_at), timezone, 'yyyy-MM-dd');
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }

  let totalSwitches = 0;
  for (const dayRows of byDay.values()) {
    const sorted = [...dayRows].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.tag_id !== sorted[i - 1]!.tag_id) {
        totalSwitches++;
      }
    }
  }

  const dayCount = Math.max(byDay.size, 1);
  return { totalSwitches, avgPerDay: totalSwitches / dayCount };
}

interface BlankRateRangeInput {
  startDate?: string | undefined;
  endDate?: string | undefined;
  wakeHour: number;
  sleepHour: number;
}

/** `get_blank_rate` / `get_stats_kpi_summary` の blankRate 部分と同じ計算式。 */
export function computeBlankRate(
  scheduledMinutes: number,
  { startDate, endDate, wakeHour, sleepHour }: BlankRateRangeInput,
): { availableMinutes: number; scheduledMinutes: number; blankMinutes: number; blankRate: number } {
  const days =
    startDate && endDate
      ? Math.max(1, (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000)
      : 7;

  const dailyMinutes =
    sleepHour <= wakeHour ? (24 - wakeHour + sleepHour) * 60 : (sleepHour - wakeHour) * 60;
  const availableMinutes = Math.round(dailyMinutes * days);
  const blankMinutes = Math.max(0, availableMinutes - scheduledMinutes);

  return {
    availableMinutes,
    scheduledMinutes,
    blankMinutes,
    blankRate: availableMinutes > 0 ? blankMinutes / availableMinutes : 0,
  };
}

interface AvailableMinutesInclusiveInput {
  startDate: string;
  endDate: string;
  wakeHour: number;
  sleepHour: number;
  timezone: string;
}

/** `get_time_pl_data` の available CTE 相当（tz 日付の inclusive 日数差）。 */
export function computeAvailableMinutesInclusive({
  startDate,
  endDate,
  wakeHour,
  sleepHour,
  timezone,
}: AvailableMinutesInclusiveInput): number {
  const startDay = formatInTimeZone(new Date(startDate), timezone, 'yyyy-MM-dd');
  const endDay = formatInTimeZone(new Date(endDate), timezone, 'yyyy-MM-dd');
  const dayCount =
    Math.round(
      (new Date(`${endDay}T00:00:00Z`).getTime() - new Date(`${startDay}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;

  const dailyMinutes =
    sleepHour <= wakeHour ? (24 - wakeHour + sleepHour) * 60 : (sleepHour - wakeHour) * 60;
  return Math.max(0, dailyMinutes * dayCount);
}
