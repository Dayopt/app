import 'server-only';

/**
 * 統計 service — KPI: 見積もり精度・空白率
 */

import {
  aggregatePlanRecordEstimationAccuracy,
  type EstimationAccuracyDbRow,
  type EstimationAccuracyTagLookup,
  transformEstimationAccuracy,
} from '../domain';

import type { DateRangeInput, StatPlanRow, TagLookupRow } from './statistics-fetchers';
import { fetchPlans, fetchRecordsByPlanIds, fetchTagsById } from './statistics-fetchers';
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
    const [plans, tagsById] = await Promise.all([
      fetchPlans(this.supabase, userId, range),
      fetchTagsById(this.supabase, userId),
    ]);
    const rows = await this.computeEstimationAccuracy(userId, plans, tagsById);
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
    tagsById: ReadonlyMap<string, TagLookupRow>,
  ): Promise<EstimationAccuracyDbRow[]> {
    const planIds = plans.map((plan) => plan.id);
    const records =
      planIds.length > 0 ? await fetchRecordsByPlanIds(this.supabase, userId, planIds) : [];

    const planRows = plans
      .filter((plan): plan is StatPlanRow & { tag_id: string } => plan.tag_id != null)
      .map((plan) => ({
        id: plan.id,
        tag_id: plan.tag_id,
        planned_minutes: minutesBetween(plan.start_at, plan.end_at),
      }));
    const recordRows = records.map((record) => ({
      plan_id: record.plan_id,
      source: record.source,
      minutes: minutesBetween(record.start_at, record.end_at),
    }));
    const tagLookup: Map<string, EstimationAccuracyTagLookup> = new Map(
      Array.from(tagsById.entries()).map(([id, tag]) => [id, { name: tag.name, color: tag.color }]),
    );

    return aggregatePlanRecordEstimationAccuracy(planRows, recordRows, tagLookup);
  }
}
