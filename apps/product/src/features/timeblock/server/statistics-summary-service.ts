import 'server-only';

/**
 * 統計 service — Summary: streak / KPI サマリー
 */

import { formatInTimeZone } from 'date-fns-tz';

import { getUserTimezone } from '@/lib/server/user-timezone-cache';

import { fetchPlans, fetchRecords } from './statistics-fetchers';
import type { BlankRateInput } from './statistics-kpi-service';
import { transformStatsOverviewResponse } from './statistics-overview-transform';
import {
  computeBlankRate,
  computeContextSwitches,
  minutesBetween,
} from './statistics-service-grouping';
import type { ServiceSupabaseClient } from './types';

export class StatisticsSummaryService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /** `get_active_dates` 相当。実績（records）が存在する日付（tz basis）の一覧。 */
  async getActiveDates(userId: string, startDate: string): Promise<string[]> {
    const timezone = await getUserTimezone(this.supabase, userId);
    const records = await fetchRecords(this.supabase, userId, { startDate });
    const days = new Set(
      records.map((record) => formatInTimeZone(new Date(record.start_at), timezone, 'yyyy-MM-dd')),
    );
    return Array.from(days).sort();
  }

  /** `get_stats_kpi_summary` 相当。 */
  async getStatsOverview(
    userId: string,
    { startDate, endDate, wakeHour, sleepHour }: BlankRateInput,
  ) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const [records, plans] = await Promise.all([
      fetchRecords(this.supabase, userId, { startDate, endDate }),
      fetchPlans(this.supabase, userId, { startDate, endDate }),
    ]);

    const cumulativeMinutes = records.reduce(
      (sum, record) => sum + minutesBetween(record.start_at, record.end_at),
      0,
    );
    const plannedEntries = records.filter((record) => record.plan_id != null).length;
    const contextSwitches = computeContextSwitches(records, timezone);
    const scheduledMinutes = plans.reduce(
      (sum, plan) => sum + minutesBetween(plan.start_at, plan.end_at),
      0,
    );
    const blankRate = computeBlankRate(scheduledMinutes, {
      startDate,
      endDate,
      wakeHour,
      sleepHour,
    });

    return transformStatsOverviewResponse({
      cumulativeTime: { totalMinutes: cumulativeMinutes },
      planRate: {
        totalEntries: records.length,
        plannedEntries,
        planRate: records.length > 0 ? plannedEntries / records.length : 0,
      },
      contextSwitches,
      blankRate,
    });
  }
}
