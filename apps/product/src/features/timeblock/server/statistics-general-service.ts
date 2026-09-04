import 'server-only';

/**
 * 統計 service — General: タグ別統計・時間帯分布・トレンド
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { getUserTimezone } from '@/lib/server/user-timezone-cache';

import {
  aggregateActivityPlanCounts,
  aggregateActivityStats,
  aggregateDayOfWeekDistribution,
  aggregateHourlyDistribution,
  aggregateMonthlyTrend,
  getMonthlyStartDate,
} from '../domain';

import type { DateRangeInput } from './statistics-fetchers';
import { fetchPlans, fetchRecords } from './statistics-fetchers';
import {
  groupHoursByDay,
  groupHoursByMonth,
  groupMinutesByDow,
  groupMinutesByHour,
} from './statistics-service-grouping';
import type { ServiceSupabaseClient } from './types';

export class StatisticsGeneralService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /**
   * アクティビティ別の実績件数・最終使用日 + Plan 側の件数。
   *
   * サイドバーの削除確認分岐がこれを引く。`counts` は records ベース、
   * `planCounts` は Plan 側を別 Record で返す。アクティビティ削除は Plan / Record
   * の両方を「アクティビティなし」にするため、呼び出し側は両方の合計を
   * 「削除で未分類になる件数」として扱う（#1576 フォローアップ）。
   */
  async getActivityStats(userId: string): Promise<{
    counts: Record<string, number>;
    planCounts: Record<string, number>;
    lastUsed: Record<string, string>;
  }> {
    const [records, plans] = await Promise.all([
      fetchRecords(this.supabase, userId),
      fetchPlans(this.supabase, userId),
    ]);

    const byActivity = new Map<string, { count: number; lastUsed: string | null }>();
    for (const record of records) {
      if (record.activity_id == null) continue;
      const acc = byActivity.get(record.activity_id) ?? { count: 0, lastUsed: null };
      acc.count += 1;
      if (acc.lastUsed == null || record.start_at > acc.lastUsed) acc.lastUsed = record.start_at;
      byActivity.set(record.activity_id, acc);
    }

    const rows = Array.from(byActivity.entries()).map(([activityId, v]) => ({
      groupKey: activityId,
      record_count: v.count,
      last_used: v.lastUsed,
    }));

    const planRows = plans
      .filter((plan): plan is typeof plan & { activity_id: string } => plan.activity_id != null)
      .map((plan) => ({ groupKey: plan.activity_id }));

    return { ...aggregateActivityStats(rows), planCounts: aggregateActivityPlanCounts(planRows) };
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
