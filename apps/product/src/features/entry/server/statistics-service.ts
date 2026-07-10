import 'server-only';

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { getUserTimezone } from '@/lib/server/user-timezone-cache';

import {
  aggregateDayOfWeekDistribution,
  aggregateHourlyDistribution,
  aggregateMonthlyTrend,
  aggregatePlanLogEstimationAccuracy,
  aggregateTagStats,
  type EstimationAccuracyDbRow,
  type EstimationAccuracyTagLookup,
  getMonthlyStartDate,
  transformEstimationAccuracy,
} from '../domain';
import {
  buildTagDashboard,
  type TagDashboardEntryRow,
  type TagDashboardTagRow,
} from '../domain/tag-dashboard';

import { transformStatsOverviewResponse } from './statistics-overview-transform';
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
import { transformTimeByTagResponse } from './statistics-time-by-tag-transform';
import type { ServiceSupabaseClient } from './types';

/**
 * Step 4: 統計 TS service。
 *
 * Step 0 の Aggregation Source Contract（`docs/projects/time-model-split/step-0-statistics-rpc-policy.md`）
 * に従い、実績系は `logs`、予定系は `plans`、予実比較は `plans` LEFT JOIN `logs`（`plan_id` 経由）を読む。
 *
 * **dormant**: このクラスは router から未接続。既存 RPC ベースの router
 * (`statistics-general-router.ts` 等) は現状維持のまま、この service は Step 8 の
 * カットオーバーで router 内部の実装として丸ごと差し替えられる前提のシグネチャを持つ。
 */

interface StatPlanRow {
  id: string;
  tag_id: string | null;
  start_at: string;
  end_at: string;
}

interface StatLogRow {
  id: string;
  tag_id: string | null;
  plan_id: string | null;
  source: string;
  start_at: string;
  end_at: string;
  fulfillment_score: number | null;
}

interface TagLookupRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface DateRangeInput {
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export interface BlankRateInput extends DateRangeInput {
  wakeHour: number;
  sleepHour: number;
}

export interface TimePLInput {
  startDate: string;
  endDate: string;
  prevStart?: string | undefined;
  prevEnd?: string | undefined;
  wakeHour: number;
  sleepHour: number;
}

export interface StatsPageDataInput {
  startDate: string;
  endDate: string;
  prevStart: string;
  prevEnd: string;
  year: number;
  monthlyMonths: number;
  wakeHour: number;
  sleepHour: number;
}

export interface TagDashboardInput {
  tagId: string;
  startDate: string;
  endDate: string;
  limit: number;
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

export class StatisticsService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  // ---------------------------------------------------------------------------
  // General: タグ別統計・時間帯分布
  // ---------------------------------------------------------------------------

  /** `get_tag_stats` 相当。実績（logs）ベースのタグ別件数・最終使用日。 */
  async getTagStats(userId: string): Promise<{
    counts: Record<string, number>;
    lastUsed: Record<string, string>;
  }> {
    const logs = await this.fetchLogs(userId);
    const byTag = new Map<string, { count: number; lastUsed: string | null }>();
    for (const log of logs) {
      if (log.tag_id == null) continue;
      const acc = byTag.get(log.tag_id) ?? { count: 0, lastUsed: null };
      acc.count += 1;
      if (acc.lastUsed == null || log.start_at > acc.lastUsed) acc.lastUsed = log.start_at;
      byTag.set(log.tag_id, acc);
    }

    const rows = Array.from(byTag.entries()).map(([tag_id, v]) => ({
      tag_id,
      entry_count: v.count,
      last_used: v.lastUsed,
    }));
    return aggregateTagStats(rows);
  }

  /** `get_time_by_tag` 相当。実績（logs）のタグ別合計時間。 */
  async getTimeByTag(userId: string, range: DateRangeInput = {}) {
    const [logs, tagsById] = await Promise.all([
      this.fetchLogs(userId, range),
      this.fetchTagsById(userId),
    ]);

    const minutesByTag = new Map<string, number>();
    for (const log of logs) {
      if (log.tag_id == null) continue;
      minutesByTag.set(
        log.tag_id,
        (minutesByTag.get(log.tag_id) ?? 0) + minutesBetween(log.start_at, log.end_at),
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
    const logs = await this.fetchLogs(userId, { startDate: startOfYear, endDate: startOfNextYear });
    return groupHoursByDay(logs, timezone);
  }

  /** `get_hourly_distribution` 相当。 */
  async getHourlyDistribution(userId: string, range: DateRangeInput = {}) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const logs = await this.fetchLogs(userId, range);
    return aggregateHourlyDistribution(groupMinutesByHour(logs, timezone));
  }

  /** `get_dow_distribution` 相当。 */
  async getDayOfWeekDistribution(userId: string, range: DateRangeInput = {}) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const logs = await this.fetchLogs(userId, range);
    return aggregateDayOfWeekDistribution(groupMinutesByDow(logs, timezone));
  }

  /** `get_monthly_hours` 相当。 */
  async getMonthlyTrend(userId: string, months = 12) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const nowStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM');
    const [nowYear, nowMonth] = nowStr.split('-').map(Number) as [number, number];
    const startDate = getMonthlyStartDate(nowYear, nowMonth, months);

    const logs = await this.fetchLogs(userId, { startDate: startDate.toISOString() });
    return aggregateMonthlyTrend(groupHoursByMonth(logs, timezone), nowYear, nowMonth, months);
  }

  // ---------------------------------------------------------------------------
  // KPI: 見積もり精度・空白率
  // ---------------------------------------------------------------------------

  /**
   * `get_estimation_accuracy` 相当。`plans` LEFT JOIN `logs`（1:N、`auto_migrated` 除外）。
   * 詳細は `domain/estimation-accuracy.ts` の `aggregatePlanLogEstimationAccuracy` を参照。
   */
  async getEstimationAccuracy(userId: string, range: DateRangeInput = {}) {
    const [plans, tagsById] = await Promise.all([
      this.fetchPlans(userId, range),
      this.fetchTagsById(userId),
    ]);
    const rows = await this.computeEstimationAccuracy(userId, plans, tagsById);
    return transformEstimationAccuracy(rows);
  }

  /** `get_blank_rate` 相当。予定（plans）ベースのスケジュール時間から空白率を算出する。 */
  async getBlankRate(userId: string, { startDate, endDate, wakeHour, sleepHour }: BlankRateInput) {
    const plans = await this.fetchPlans(userId, { startDate, endDate });
    const scheduledMinutes = plans.reduce(
      (sum, plan) => sum + minutesBetween(plan.start_at, plan.end_at),
      0,
    );
    return computeBlankRate(scheduledMinutes, { startDate, endDate, wakeHour, sleepHour });
  }

  // ---------------------------------------------------------------------------
  // Summary: streak / KPI サマリー / Time P/L / Review panel 統合データ
  // ---------------------------------------------------------------------------

  /** `get_active_dates` 相当。実績（logs）が存在する日付（tz basis）の一覧。 */
  async getActiveDates(userId: string, startDate: string): Promise<string[]> {
    const timezone = await getUserTimezone(this.supabase, userId);
    const logs = await this.fetchLogs(userId, { startDate });
    const days = new Set(
      logs.map((log) => formatInTimeZone(new Date(log.start_at), timezone, 'yyyy-MM-dd')),
    );
    return Array.from(days).sort();
  }

  /** `get_stats_kpi_summary` 相当。 */
  async getStatsOverview(
    userId: string,
    { startDate, endDate, wakeHour, sleepHour }: BlankRateInput,
  ) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const [logs, plans] = await Promise.all([
      this.fetchLogs(userId, { startDate, endDate }),
      this.fetchPlans(userId, { startDate, endDate }),
    ]);

    const cumulativeMinutes = logs.reduce(
      (sum, log) => sum + minutesBetween(log.start_at, log.end_at),
      0,
    );
    const plannedEntries = logs.filter((log) => log.plan_id != null).length;
    const contextSwitches = computeContextSwitches(logs, timezone);
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
        totalEntries: logs.length,
        plannedEntries,
        planRate: logs.length > 0 ? plannedEntries / logs.length : 0,
      },
      contextSwitches,
      blankRate,
    });
  }

  /** `get_time_pl_data` 相当。タグ別の予実（budget/actual）+ 日次ポイント。 */
  async getTimePLData(userId: string, input: TimePLInput): Promise<TimePLResponse> {
    const { startDate, endDate, prevStart, prevEnd, wakeHour, sleepHour } = input;
    const timezone = await getUserTimezone(this.supabase, userId);

    const [plans, logs, tagsById] = await Promise.all([
      this.fetchPlans(userId, { startDate, endDate }),
      this.fetchLogs(userId, { startDate, endDate }),
      this.fetchTagsById(userId),
    ]);
    const tags = this.buildTagPL(plans, logs, tagsById);

    let prevTags: TimePLResponse['prevTags'] = [];
    if (prevStart && prevEnd) {
      const [prevPlans, prevLogs] = await Promise.all([
        this.fetchPlans(userId, { startDate: prevStart, endDate: prevEnd }),
        this.fetchLogs(userId, { startDate: prevStart, endDate: prevEnd }),
      ]);
      prevTags = this.buildTagPL(prevPlans, prevLogs, tagsById);
    }

    const availableMinutes = computeAvailableMinutesInclusive({
      startDate,
      endDate,
      wakeHour,
      sleepHour,
      timezone,
    });

    return { tags, prevTags, availableMinutes };
  }

  /** `get_stats_page_data` 相当。Review panel 用データを一括構築する。 */
  async getStatsPageData(userId: string, input: StatsPageDataInput): Promise<StatsPageData> {
    const { startDate, endDate, prevStart, prevEnd, year, monthlyMonths, wakeHour, sleepHour } =
      input;
    const timezone = await getUserTimezone(this.supabase, userId);

    const startOfYear = fromZonedTime(`${year}-01-01T00:00:00`, timezone).toISOString();
    const startOfNextYear = fromZonedTime(`${year + 1}-01-01T00:00:00`, timezone).toISOString();
    const nowStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM');
    const [nowYear, nowMonth] = nowStr.split('-').map(Number) as [number, number];
    const monthlyStartDate = getMonthlyStartDate(nowYear, nowMonth, monthlyMonths);

    const [logs, plans, prevLogs, prevPlans, yearLogs, monthlyLogs, tagsById] = await Promise.all([
      this.fetchLogs(userId, { startDate, endDate }),
      this.fetchPlans(userId, { startDate, endDate }),
      this.fetchLogs(userId, { startDate: prevStart, endDate: prevEnd }),
      this.fetchPlans(userId, { startDate: prevStart, endDate: prevEnd }),
      this.fetchLogs(userId, { startDate: startOfYear, endDate: startOfNextYear }),
      this.fetchLogs(userId, { startDate: monthlyStartDate.toISOString() }),
      this.fetchTagsById(userId),
    ]);

    const overview = this.buildOverviewSection(logs);
    const prevOverview = this.buildOverviewSection(prevLogs);
    const contextSwitches = computeContextSwitches(logs, timezone);
    const scheduledMinutes = plans.reduce(
      (sum, plan) => sum + minutesBetween(plan.start_at, plan.end_at),
      0,
    );
    const fullBlankRate = computeBlankRate(scheduledMinutes, {
      startDate,
      endDate,
      wakeHour,
      sleepHour,
    });

    const timeByTag = transformTimeByTagResponse(this.buildTimeByTagRows(logs, tagsById));
    // NOTE: get_stats_page_data の hourly/dow は 24h/7dow の raw bucket をそのまま返す
    // （getHourlyDistribution/getDayOfWeekDistribution procedure が行う 2h slot 集約や
    // 曜日ラベル変換は適用しない。RPC 契約どおり）。
    const hourly = groupMinutesByHour(logs, timezone).map((row) => ({
      hour: row.hour,
      totalMinutes: row.total_minutes,
    }));
    const dow = groupMinutesByDow(logs, timezone).map((row) => ({
      dow: row.dow,
      totalMinutes: row.total_minutes,
    }));
    const energyMap = groupEnergyMap(logs, timezone).map(
      ({ avgFulfillment: _avgFulfillment, ...rest }) => rest,
    );
    const prevEnergyMap = groupEnergyMap(prevLogs, timezone).map(
      ({ avgFulfillment: _avgFulfillment, ...rest }) => rest,
    );

    const estimationAccuracy = transformEstimationAccuracy(
      await this.computeEstimationAccuracy(userId, plans, tagsById),
    );
    const prevEstimationAccuracy = transformEstimationAccuracy(
      await this.computeEstimationAccuracy(userId, prevPlans, tagsById),
    );

    const dailyHours = groupHoursByDay(yearLogs, timezone);
    const monthlyTrend = aggregateMonthlyTrend(
      groupHoursByMonth(monthlyLogs, timezone),
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
      timeByTag,
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

  // ---------------------------------------------------------------------------
  // タグ詳細ダッシュボード（旧 `entriesTagStatisticsRouter.getTagDashboard`）
  // ---------------------------------------------------------------------------

  async getTagDashboard(userId: string, { tagId, startDate, endDate, limit }: TagDashboardInput) {
    const timezone = await getUserTimezone(this.supabase, userId);
    const [tag, logs, plans] = await Promise.all([
      this.fetchTagById(userId, tagId),
      this.fetchLogsOverlapping(userId, tagId, startDate, endDate),
      this.fetchPlansOverlapping(userId, tagId, startDate, endDate),
    ]);

    const plansById = new Map(plans.map((plan) => [plan.id, plan]));

    // 1 plan に複数 log（分割記録）が紐づく場合、予定時間の二重計上を避けるため
    // 「代表 log」1 件だけに planned range を割り当てる。from_plan があればそれを優先する。
    const primaryLogIdByPlanId = new Map<string, string>();
    for (const log of logs) {
      if (log.plan_id == null) continue;
      const currentId = primaryLogIdByPlanId.get(log.plan_id);
      if (!currentId) {
        primaryLogIdByPlanId.set(log.plan_id, log.id);
        continue;
      }
      if (log.source === 'from_plan') {
        primaryLogIdByPlanId.set(log.plan_id, log.id);
      }
    }

    const rows: TagDashboardEntryRow[] = logs.map((log) => {
      const plan = log.plan_id ? plansById.get(log.plan_id) : undefined;
      const isPrimary = log.plan_id != null && primaryLogIdByPlanId.get(log.plan_id) === log.id;
      return {
        id: log.id,
        title: log.title,
        description: log.note,
        start_time: isPrimary && plan ? plan.start_at : null,
        end_time: isPrimary && plan ? plan.end_at : null,
        actual_start_time: log.start_at,
        actual_end_time: log.end_at,
        tag_id: log.tag_id,
      };
    });

    // 未記録・未 skip の plan は「予定のみ」の行として残す（実績時間は 0）。
    const recordedPlanIds = new Set(
      logs.map((log) => log.plan_id).filter((id): id is string => id != null),
    );
    for (const plan of plans) {
      if (recordedPlanIds.has(plan.id) || plan.skipped_at) continue;
      rows.push({
        id: plan.id,
        title: plan.title,
        description: plan.note,
        start_time: plan.start_at,
        end_time: plan.end_at,
        actual_start_time: null,
        actual_end_time: null,
        tag_id: plan.tag_id,
      });
    }

    return buildTagDashboard({ tag, rows, limit, timezone });
  }

  // ---------------------------------------------------------------------------
  // private: 見積もり精度の共通計算
  // ---------------------------------------------------------------------------

  private async computeEstimationAccuracy(
    userId: string,
    plans: ReadonlyArray<StatPlanRow>,
    tagsById: ReadonlyMap<string, TagLookupRow>,
  ): Promise<EstimationAccuracyDbRow[]> {
    const planIds = plans.map((plan) => plan.id);
    const logs = planIds.length > 0 ? await this.fetchLogsByPlanIds(userId, planIds) : [];

    const planRows = plans
      .filter((plan): plan is StatPlanRow & { tag_id: string } => plan.tag_id != null)
      .map((plan) => ({
        id: plan.id,
        tag_id: plan.tag_id,
        planned_minutes: minutesBetween(plan.start_at, plan.end_at),
      }));
    const logRows = logs.map((log) => ({
      plan_id: log.plan_id,
      source: log.source,
      minutes: minutesBetween(log.start_at, log.end_at),
    }));
    const tagLookup: Map<string, EstimationAccuracyTagLookup> = new Map(
      Array.from(tagsById.entries()).map(([id, tag]) => [id, { name: tag.name, color: tag.color }]),
    );

    return aggregatePlanLogEstimationAccuracy(planRows, logRows, tagLookup);
  }

  private buildOverviewSection(logs: ReadonlyArray<StatLogRow>) {
    const totalMinutes = logs.reduce(
      (sum, log) => sum + minutesBetween(log.start_at, log.end_at),
      0,
    );
    const entryCount = logs.filter((log) => log.fulfillment_score != null).length;
    const totalEntries = logs.length;
    const plannedEntries = logs.filter((log) => log.plan_id != null).length;
    return {
      totalMinutes,
      entryCount,
      totalEntries,
      plannedEntries,
      planRate: totalEntries > 0 ? plannedEntries / totalEntries : 0,
    };
  }

  private buildTimeByTagRows(
    logs: ReadonlyArray<StatLogRow>,
    tagsById: ReadonlyMap<string, TagLookupRow>,
  ) {
    const minutesByTag = new Map<string, number>();
    for (const log of logs) {
      if (log.tag_id == null) continue;
      minutesByTag.set(
        log.tag_id,
        (minutesByTag.get(log.tag_id) ?? 0) + minutesBetween(log.start_at, log.end_at),
      );
    }
    return Array.from(minutesByTag.entries())
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
  }

  private buildTagPL(
    plans: ReadonlyArray<StatPlanRow>,
    logs: ReadonlyArray<StatLogRow>,
    tagsById: ReadonlyMap<string, TagLookupRow>,
  ): TimePLResponse['tags'] {
    interface Accumulator {
      budget: number;
      actual: number;
      hasPlan: boolean;
    }
    const byTag = new Map<string, Accumulator>();

    for (const plan of plans) {
      if (plan.tag_id == null) continue;
      const acc = byTag.get(plan.tag_id) ?? { budget: 0, actual: 0, hasPlan: false };
      acc.budget += minutesBetween(plan.start_at, plan.end_at);
      acc.hasPlan = true;
      byTag.set(plan.tag_id, acc);
    }
    for (const log of logs) {
      if (log.tag_id == null) continue;
      const acc = byTag.get(log.tag_id) ?? { budget: 0, actual: 0, hasPlan: false };
      acc.actual += minutesBetween(log.start_at, log.end_at);
      byTag.set(log.tag_id, acc);
    }

    return Array.from(byTag.entries())
      .filter(([, acc]) => acc.budget > 0 || acc.actual > 0)
      .map(([tagId, acc]) => {
        const tag = tagsById.get(tagId);
        return {
          tagId,
          tagName: tag?.name ?? '',
          tagColor: tag?.color ?? 'indigo',
          tagIcon: tag?.icon ?? null,
          budgetMinutes: roundTo1(acc.budget),
          actualMinutes: roundTo1(acc.actual),
          isPlanned: acc.hasPlan,
        };
      })
      .sort((a, b) => b.actualMinutes - a.actualMinutes);
  }

  // ---------------------------------------------------------------------------
  // private: fetch
  // ---------------------------------------------------------------------------

  private async fetchLogs(userId: string, range: DateRangeInput = {}): Promise<StatLogRow[]> {
    let query = this.supabase
      .from('logs')
      .select('id, tag_id, plan_id, source, start_at, end_at, fulfillment_score')
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (range.startDate) query = query.gte('start_at', range.startDate);
    if (range.endDate) query = query.lt('start_at', range.endDate);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch logs: ${error.message}`);
    return data ?? [];
  }

  private async fetchLogsByPlanIds(userId: string, planIds: string[]): Promise<StatLogRow[]> {
    const { data, error } = await this.supabase
      .from('logs')
      .select('id, tag_id, plan_id, source, start_at, end_at, fulfillment_score')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('plan_id', planIds);
    if (error) throw new Error(`Failed to fetch logs by plan ids: ${error.message}`);
    return data ?? [];
  }

  private async fetchPlans(userId: string, range: DateRangeInput = {}): Promise<StatPlanRow[]> {
    let query = this.supabase
      .from('plans')
      .select('id, tag_id, start_at, end_at')
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (range.startDate) query = query.gte('start_at', range.startDate);
    if (range.endDate) query = query.lt('start_at', range.endDate);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch plans: ${error.message}`);
    return data ?? [];
  }

  private async fetchTagsById(userId: string): Promise<Map<string, TagLookupRow>> {
    const { data, error } = await this.supabase
      .from('tags')
      .select('id, name, color, icon')
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to fetch tags: ${error.message}`);
    return new Map((data ?? []).map((tag) => [tag.id, tag]));
  }

  private async fetchTagById(userId: string, tagId: string): Promise<TagDashboardTagRow> {
    const { data, error } = await this.supabase
      .from('tags')
      .select('id, name, color, icon')
      .eq('user_id', userId)
      .eq('id', tagId)
      .eq('is_active', true)
      .single();
    if (error || !data) throw new Error(`Tag not found: ${error?.message ?? tagId}`);
    return data;
  }

  private async fetchLogsOverlapping(
    userId: string,
    tagId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<StatLogRow & { title: string; note: string | null }>> {
    const { data, error } = await this.supabase
      .from('logs')
      .select('id, title, note, tag_id, plan_id, source, start_at, end_at, fulfillment_score')
      .eq('user_id', userId)
      .eq('tag_id', tagId)
      .is('deleted_at', null)
      .lt('start_at', endDate)
      .gt('end_at', startDate)
      .order('start_at', { ascending: true });
    if (error) throw new Error(`Failed to fetch logs for tag dashboard: ${error.message}`);
    return data ?? [];
  }

  private async fetchPlansOverlapping(
    userId: string,
    tagId: string,
    startDate: string,
    endDate: string,
  ): Promise<
    Array<StatPlanRow & { title: string; note: string | null; skipped_at: string | null }>
  > {
    const { data, error } = await this.supabase
      .from('plans')
      .select('id, title, note, tag_id, start_at, end_at, skipped_at')
      .eq('user_id', userId)
      .eq('tag_id', tagId)
      .is('deleted_at', null)
      .lt('start_at', endDate)
      .gt('end_at', startDate)
      .order('start_at', { ascending: true });
    if (error) throw new Error(`Failed to fetch plans for tag dashboard: ${error.message}`);
    return data ?? [];
  }
}

export function createStatisticsService(supabase: ServiceSupabaseClient): StatisticsService {
  return new StatisticsService(supabase);
}
