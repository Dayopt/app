import 'server-only';

/**
 * 統計 service — KPI: 見積もり精度・空白率
 */

import {
  aggregatePlanRecordEstimationAccuracy,
  type EstimationAccuracyActivityLookup,
  type EstimationAccuracyDbRow,
  transformEstimationAccuracy,
} from '../domain';

import type {
  ActivityLookupRow,
  CategoryLookupRow,
  DateRangeInput,
  StatPlanRow,
} from './statistics-fetchers';
import {
  fetchActivitiesById,
  fetchCategoriesById,
  fetchPlans,
  fetchRecordsByPlanIds,
} from './statistics-fetchers';
import { computeBlankRate, minutesBetween } from './statistics-service-grouping';
import type { ServiceSupabaseClient } from './types';

export interface BlankRateInput extends DateRangeInput {
  wakeHour: number;
  sleepHour: number;
}

export class StatisticsKpiService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /**
   * `get_estimation_accuracy` 相当。`plans` LEFT JOIN `records`（1:N、`auto_migrated` 除外）。
   * 詳細は `domain/estimation-accuracy.ts` の `aggregatePlanRecordEstimationAccuracy` を参照。
   */
  async getEstimationAccuracy(userId: string, range: DateRangeInput = {}) {
    const [plans, activitiesById, categoriesById] = await Promise.all([
      fetchPlans(this.supabase, userId, range),
      fetchActivitiesById(this.supabase, userId),
      fetchCategoriesById(this.supabase, userId),
    ]);
    const rows = await this.computeEstimationAccuracy(
      userId,
      plans,
      activitiesById,
      categoriesById,
    );
    return transformEstimationAccuracy(rows);
  }

  /** `get_blank_rate` 相当。予定（plans）ベースのスケジュール時間から空白率を算出する。 */
  async getBlankRate(userId: string, { startDate, endDate, wakeHour, sleepHour }: BlankRateInput) {
    const plans = await fetchPlans(this.supabase, userId, { startDate, endDate });
    const scheduledMinutes = plans.reduce(
      (sum, plan) => sum + minutesBetween(plan.start_at, plan.end_at),
      0,
    );
    return computeBlankRate(scheduledMinutes, { startDate, endDate, wakeHour, sleepHour });
  }

  /** 見積もり精度の共通計算（summary の getStatsPageData からも使う） */
  async computeEstimationAccuracy(
    userId: string,
    plans: ReadonlyArray<StatPlanRow>,
    activitiesById: ReadonlyMap<string, ActivityLookupRow>,
    categoriesById: ReadonlyMap<string, CategoryLookupRow>,
  ): Promise<EstimationAccuracyDbRow[]> {
    const planIds = plans.map((plan) => plan.id);
    const records =
      planIds.length > 0 ? await fetchRecordsByPlanIds(this.supabase, userId, planIds) : [];

    // activity_id が null の plan も未分類バケットとして集計に含める（#1576 を activity 軸へ踏襲）。
    // フィルタは `aggregatePlanRecordEstimationAccuracy` 側が担う。
    const planRows = plans.map((plan) => ({
      id: plan.id,
      activity_id: plan.activity_id,
      planned_minutes: minutesBetween(plan.start_at, plan.end_at),
    }));
    const recordRows = records.map((record) => ({
      plan_id: record.plan_id,
      source: record.source,
      minutes: minutesBetween(record.start_at, record.end_at),
    }));

    // アクティビティ自身は色を持たないため、所属カテゴリーの色をここで継承させておく
    // （`statistics-activity-axis-builders.ts` の `buildActivityPL` と同じ結線パターン）。
    const activityLookup: Map<string, EstimationAccuracyActivityLookup> = new Map(
      Array.from(activitiesById.entries()).map(([id, activity]) => {
        const category =
          activity.category_id == null ? undefined : categoriesById.get(activity.category_id);
        return [id, { name: activity.name, color: category?.color ?? null }];
      }),
    );

    return aggregatePlanRecordEstimationAccuracy(planRows, recordRows, activityLookup);
  }
}
