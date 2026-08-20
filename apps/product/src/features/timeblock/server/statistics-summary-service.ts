import 'server-only';

/**
 * 統計 service — Summary: streak / KPI サマリー / Time P/L / Review panel 統合データ
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { getUserTimezone } from '@/lib/server/user-timezone-cache';

import { aggregateMonthlyTrend, getMonthlyStartDate, transformEstimationAccuracy } from '../domain';

import { buildActivityPL, buildSegmentTotals } from './statistics-activity-axis-builders';
import {
  fetchActivitiesById,
  fetchCategoriesById,
  fetchPlans,
  fetchRecords,
  fetchTagsById,
} from './statistics-fetchers';
import type { BlankRateInput, StatisticsKpiService } from './statistics-kpi-service';
import { transformStatsOverviewResponse } from './statistics-overview-transform';
import { buildOverviewSection, filterRowsByVisibleDateKeys } from './statistics-row-builders';
import {
  computeAvailableMinutesInclusive,
  computeBlankRate,
  computeContextSwitches,
  groupEnergyMap,
  groupHoursByDay,
  groupHoursByMonth,
  groupMinutesByDow,
  groupMinutesByHour,
  minutesBetween,
} from './statistics-service-grouping';
import type { StatsPageData, TimePLResponse } from './statistics-shared';
import type { ServiceSupabaseClient } from './types';

export interface TimePLInput {
  startDate: string;
  endDate: string;
  prevStart?: string | undefined;
  prevEnd?: string | undefined;
  visibleDateKeys?: readonly string[] | undefined;
  prevVisibleDateKeys?: readonly string[] | undefined;
  wakeHour: number;
  sleepHour: number;
}

/** セグメント別合計の 1 行。`total` / `share` を持たない（#2162 §6-3）。 */
interface SegmentTotalRow {
  segmentId: string;
  segmentName: string;
  budgetMinutes: number;
  actualMinutes: number;
}

export interface SegmentTotalsInput {
  startDate: string;
  endDate: string;
  prevStart?: string | undefined;
  prevEnd?: string | undefined;
  /** セグメント定義（features/review が所有。timeblock は Layer 1 のため自分では取得しない） */
  segments: ReadonlyArray<{ id: string; name: string; activityIds: readonly string[] }>;
}

interface SegmentTotalsResponse {
  current: SegmentTotalRow[];
  previous: SegmentTotalRow[];
}

export interface StatsPageDataInput {
  startDate: string;
  endDate: string;
  prevStart: string;
  prevEnd: string;
  visibleDateKeys?: readonly string[] | undefined;
  prevVisibleDateKeys?: readonly string[] | undefined;
  year: number;
  monthlyMonths: number;
  wakeHour: number;
  sleepHour: number;
}

export class StatisticsSummaryService {
  constructor(
    private readonly supabase: ServiceSupabaseClient,
    private readonly kpiService: StatisticsKpiService,
  ) {}

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

  /** アクティビティ別の予実（budget/actual）+ 日次ポイント（#2162。旧タグ軸から移行）。 */
  async getTimePLData(userId: string, input: TimePLInput): Promise<TimePLResponse> {
    const {
      startDate,
      endDate,
      prevStart,
      prevEnd,
      visibleDateKeys,
      prevVisibleDateKeys,
      wakeHour,
      sleepHour,
    } = input;
    const timezone = await getUserTimezone(this.supabase, userId);

    const [rangePlans, rangeRecords, activitiesById, categoriesById] = await Promise.all([
      fetchPlans(this.supabase, userId, { startDate, endDate }),
      fetchRecords(this.supabase, userId, { startDate, endDate }),
      fetchActivitiesById(this.supabase, userId),
      fetchCategoriesById(this.supabase, userId),
    ]);
    const plans = filterRowsByVisibleDateKeys(rangePlans, visibleDateKeys, timezone);
    const records = filterRowsByVisibleDateKeys(rangeRecords, visibleDateKeys, timezone);
    const activities = buildActivityPL(plans, records, activitiesById, categoriesById).map(
      toTimePLResponseRow,
    );

    let prevActivities: TimePLResponse['prevActivities'] = [];
    if (prevStart && prevEnd) {
      const [rangePrevPlans, rangePrevRecords] = await Promise.all([
        fetchPlans(this.supabase, userId, { startDate: prevStart, endDate: prevEnd }),
        fetchRecords(this.supabase, userId, { startDate: prevStart, endDate: prevEnd }),
      ]);
      const prevPlans = filterRowsByVisibleDateKeys(rangePrevPlans, prevVisibleDateKeys, timezone);
      const prevRecords = filterRowsByVisibleDateKeys(
        rangePrevRecords,
        prevVisibleDateKeys,
        timezone,
      );
      prevActivities = buildActivityPL(prevPlans, prevRecords, activitiesById, categoriesById).map(
        toTimePLResponseRow,
      );
    }

    const availableMinutes = computeAvailableMinutesInclusive({
      startDate,
      endDate,
      wakeHour,
      sleepHour,
      timezone,
      visibleDayCount: visibleDateKeys?.length,
    });

    return { activities, prevActivities, availableMinutes };
  }

  /**
   * セグメント別の予実合計 + 直前期間との比較（#2181 Step 5）。
   *
   * セグメント定義（id/name/activityIds）は `features/review`（Layer 2）の
   * `segments` テーブルが持つため、ここでは受け取るだけで自分では取得しない
   * （`features/timeblock` は Layer 1 なので Layer 2 を参照できない、DAG）。
   *
   * `total` / `share` を返さない（#2162 §6-3 の表示規律。呼び出し側で合算しないこと）。
   */
  async getSegmentTotals(
    userId: string,
    input: SegmentTotalsInput,
  ): Promise<SegmentTotalsResponse> {
    const { startDate, endDate, prevStart, prevEnd, segments } = input;

    const [plans, records, activitiesById] = await Promise.all([
      fetchPlans(this.supabase, userId, { startDate, endDate }),
      fetchRecords(this.supabase, userId, { startDate, endDate }),
      fetchActivitiesById(this.supabase, userId),
    ]);
    const current = buildSegmentTotals(plans, records, activitiesById, segments);

    let previous: SegmentTotalsResponse['previous'] = [];
    if (prevStart && prevEnd) {
      const [prevPlans, prevRecords] = await Promise.all([
        fetchPlans(this.supabase, userId, { startDate: prevStart, endDate: prevEnd }),
        fetchRecords(this.supabase, userId, { startDate: prevStart, endDate: prevEnd }),
      ]);
      previous = buildSegmentTotals(prevPlans, prevRecords, activitiesById, segments);
    }

    return { current, previous };
  }

  /** `get_stats_page_data` 相当。Review panel 用データを一括構築する。 */
  async getStatsPageData(userId: string, input: StatsPageDataInput): Promise<StatsPageData> {
    const {
      startDate,
      endDate,
      prevStart,
      prevEnd,
      visibleDateKeys,
      prevVisibleDateKeys,
      year,
      monthlyMonths,
      wakeHour,
      sleepHour,
    } = input;
    const timezone = await getUserTimezone(this.supabase, userId);

    const startOfYear = fromZonedTime(`${year}-01-01T00:00:00`, timezone).toISOString();
    const startOfNextYear = fromZonedTime(`${year + 1}-01-01T00:00:00`, timezone).toISOString();
    const nowStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM');
    const [nowYear, nowMonth] = nowStr.split('-').map(Number) as [number, number];
    const monthlyStartDate = getMonthlyStartDate(nowYear, nowMonth, monthlyMonths);

    const [
      rangeRecords,
      rangePlans,
      rangePrevRecords,
      rangePrevPlans,
      yearRecords,
      monthlyRecords,
      tagsById,
    ] = await Promise.all([
      fetchRecords(this.supabase, userId, { startDate, endDate }),
      fetchPlans(this.supabase, userId, { startDate, endDate }),
      fetchRecords(this.supabase, userId, { startDate: prevStart, endDate: prevEnd }),
      fetchPlans(this.supabase, userId, { startDate: prevStart, endDate: prevEnd }),
      fetchRecords(this.supabase, userId, { startDate: startOfYear, endDate: startOfNextYear }),
      fetchRecords(this.supabase, userId, { startDate: monthlyStartDate.toISOString() }),
      fetchTagsById(this.supabase, userId),
    ]);
    const records = filterRowsByVisibleDateKeys(rangeRecords, visibleDateKeys, timezone);
    const plans = filterRowsByVisibleDateKeys(rangePlans, visibleDateKeys, timezone);
    const prevRecords = filterRowsByVisibleDateKeys(
      rangePrevRecords,
      prevVisibleDateKeys,
      timezone,
    );
    const prevPlans = filterRowsByVisibleDateKeys(rangePrevPlans, prevVisibleDateKeys, timezone);

    const overview = buildOverviewSection(records);
    const prevOverview = buildOverviewSection(prevRecords);
    const contextSwitches = computeContextSwitches(records, timezone);
    const scheduledMinutes = plans.reduce(
      (sum, plan) => sum + minutesBetween(plan.start_at, plan.end_at),
      0,
    );
    const fullBlankRate = computeBlankRate(scheduledMinutes, {
      startDate,
      endDate,
      wakeHour,
      sleepHour,
      visibleDayCount: visibleDateKeys?.length,
    });

    // NOTE: get_stats_page_data の hourly/dow は 24h/7dow の raw bucket をそのまま返す
    // （getHourlyDistribution/getDayOfWeekDistribution procedure が行う 2h slot 集約や
    // 曜日ラベル変換は適用しない。RPC 契約どおり）。
    const hourly = groupMinutesByHour(records, timezone).map((row) => ({
      hour: row.hour,
      totalMinutes: row.total_minutes,
    }));
    const dow = groupMinutesByDow(records, timezone).map((row) => ({
      dow: row.dow,
      totalMinutes: row.total_minutes,
    }));
    const energyMap = groupEnergyMap(records, timezone);
    const prevEnergyMap = groupEnergyMap(prevRecords, timezone);

    const estimationAccuracy = transformEstimationAccuracy(
      await this.kpiService.computeEstimationAccuracy(userId, plans, tagsById),
    );
    const prevEstimationAccuracy = transformEstimationAccuracy(
      await this.kpiService.computeEstimationAccuracy(userId, prevPlans, tagsById),
    );

    const dailyHours = groupHoursByDay(yearRecords, timezone);
    const monthlyTrend = aggregateMonthlyTrend(
      groupHoursByMonth(monthlyRecords, timezone),
      nowYear,
      nowMonth,
      monthlyMonths,
    );

    return {
      overview,
      prevOverview,
      contextSwitches,
      blankRate: {
        availableMinutes: fullBlankRate.availableMinutes,
        scheduledMinutes: fullBlankRate.scheduledMinutes,
        blankRate: fullBlankRate.blankRate,
      },
      hourly,
      dow,
      energyMap,
      estimationAccuracy,
      prevEstimationAccuracy,
      prevEnergyMap,
      dailyHours,
      monthlyTrend,
    };
  }
}

/**
 * `buildActivityPL` の出力から公開契約（`TimePLResponse`）にだけ絞る。
 *
 * `categoryId` は集計の途中経路で使う内部結線用の join key で、Time P/L の
 * consumer が必要とする情報ではないため公開しない。
 */
function toTimePLResponseRow(
  row: ReturnType<typeof buildActivityPL>[number],
): TimePLResponse['activities'][number] {
  return {
    activityId: row.activityId,
    activityName: row.activityName,
    categoryColor: row.categoryColor,
    categoryIcon: row.categoryIcon,
    budgetMinutes: row.budgetMinutes,
    actualMinutes: row.actualMinutes,
    isPlanned: row.isPlanned,
    isNoActivity: row.isNoActivity,
  };
}
