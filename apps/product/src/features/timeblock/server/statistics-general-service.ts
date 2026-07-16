import 'server-only';

/**
 * 統計 service — General: タグ別統計・時間帯分布・トレンド
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { getUserTimezone } from '@/lib/server/user-timezone-cache';

import {
  aggregateDayOfWeekDistribution,
  aggregateHourlyDistribution,
  aggregateMonthlyTrend,
  aggregateTagStats,
  getMonthlyStartDate,
} from '../domain';

import type { DateRangeInput } from './statistics-fetchers';
import { fetchRecords, fetchTagsById } from './statistics-fetchers';
import {
  groupHoursByDay,
  groupHoursByMonth,
  groupMinutesByDow,
  groupMinutesByHour,
  minutesBetween,
} from './statistics-service-grouping';
import { transformTimeByTagResponse } from './statistics-time-by-tag-transform';
import type { ServiceSupabaseClient } from './types';

export class StatisticsGeneralService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /** `get_tag_stats` 相当。実績（records）ベースのタグ別件数・最終使用日。 */
  async getTagStats(userId: string): Promise<{
    counts: Record<string, number>;
    lastUsed: Record<string, string>;
  }> {
    const records = await fetchRecords(this.supabase, userId);
    const byTag = new Map<string, { count: number; lastUsed: string | null }>();
    for (const record of records) {
      if (record.tag_id == null) continue;
      const acc = byTag.get(record.tag_id) ?? { count: 0, lastUsed: null };
      acc.count += 1;
      if (acc.lastUsed == null || record.start_at > acc.lastUsed) acc.lastUsed = record.start_at;
      byTag.set(record.tag_id, acc);
    }

    const rows = Array.from(byTag.entries()).map(([tag_id, v]) => ({
      tag_id,
      record_count: v.count,
      last_used: v.lastUsed,
    }));
    return aggregateTagStats(rows);
  }

  /** `get_time_by_tag` 相当。実績（records）のタグ別合計時間。 */
  async getTimeByTag(userId: string, range: DateRangeInput = {}) {
    const [records, tagsById] = await Promise.all([
      fetchRecords(this.supabase, userId, range),
      fetchTagsById(this.supabase, userId),
    ]);

    const minutesByTag = new Map<string, number>();
    for (const record of records) {
      if (record.tag_id == null) continue;
      minutesByTag.set(
        record.tag_id,
        (minutesByTag.get(record.tag_id) ?? 0) + minutesBetween(record.start_at, record.end_at),
      );
    }

    const rows = Array.from(minutesByTag.entries())
      .filter(([, minutes]) => minutes > 0)
      .map(([tagId, minutes]) => {
        const tag = tagsById.get(tagId);
        return {
          tag_id: tagId,
          tag_name: tag?.name ?? '',
          tag_color: tag?.color ?? 'indigo',
          hours: minutes / 60,
        };
      })
      .sort((a, b) => b.hours - a.hours);

    return transformTimeByTagResponse(rows);
  }

  /** `get_daily_hours` 相当。指定年の日別実績時間（ヒートマップ用）。 */
  async getDailyHours(userId: string, year: number) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const startOfYear = fromZonedTime(`${year}-01-01T00:00:00`, timezone).toISOString();
    const startOfNextYear = fromZonedTime(`${year + 1}-01-01T00:00:00`, timezone).toISOString();
    const records = await fetchRecords(this.supabase, userId, {
      startDate: startOfYear,
      endDate: startOfNextYear,
    });
    return groupHoursByDay(records, timezone);
  }

  /** `get_hourly_distribution` 相当。 */
  async getHourlyDistribution(userId: string, range: DateRangeInput = {}) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const records = await fetchRecords(this.supabase, userId, range);
    return aggregateHourlyDistribution(groupMinutesByHour(records, timezone));
  }

  /** `get_dow_distribution` 相当。 */
  async getDayOfWeekDistribution(userId: string, range: DateRangeInput = {}) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const records = await fetchRecords(this.supabase, userId, range);
    return aggregateDayOfWeekDistribution(groupMinutesByDow(records, timezone));
  }

  /** `get_monthly_hours` 相当。 */
  async getMonthlyTrend(userId: string, months = 12) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const nowStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM');
    const [nowYear, nowMonth] = nowStr.split('-').map(Number) as [number, number];
    const startDate = getMonthlyStartDate(nowYear, nowMonth, months);

    const records = await fetchRecords(this.supabase, userId, {
      startDate: startDate.toISOString(),
    });
    return aggregateMonthlyTrend(groupHoursByMonth(records, timezone), nowYear, nowMonth, months);
  }
}
