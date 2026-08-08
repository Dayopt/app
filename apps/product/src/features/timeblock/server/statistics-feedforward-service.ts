import 'server-only';

/**
 * 統計 service — 作成時フィードフォワード（タグ別見積もり係数）
 *
 * ADR-026（`docs/product/log/2026-07-10-analytics-expression-policy.md`）の 1 点目。
 * 集計の定義は `domain/tag-estimation-factor.ts` が正本で、この層は行取得と分単位への
 * 変換だけを担う。
 */

import { MS_PER_DAY } from '@/lib/date/constants';

import { aggregateTagEstimationFactors, type TagEstimationFactor } from '../domain';

import { fetchPlansForEstimation, fetchRecordsByPlanIds } from './statistics-fetchers';
import { minutesBetween } from './statistics-service-grouping';
import type { ServiceSupabaseClient } from './types';

/** ADR-026 の「直近 4 週」。`plans.start_at` の [now - 28 日, now) で切る。 */
export const ESTIMATION_WINDOW_DAYS = 28;

export class StatisticsFeedforwardService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /**
   * 直近 4 週のタグ別見積もり係数を返す。`n >= 3` のタグだけが含まれる。
   *
   * 期間は UTC の絶対時刻で切る。タイムゾーン境界に依存する「日」の集計ではなく
   * 「今から 28 日前まで」の窓なので、user timezone を引く必要が無い。
   */
  async getTagEstimationFactors(userId: string, now = new Date()): Promise<TagEstimationFactor[]> {
    const startDate = new Date(now.getTime() - ESTIMATION_WINDOW_DAYS * MS_PER_DAY).toISOString();
    const endDate = now.toISOString();
    const plans = await fetchPlansForEstimation(this.supabase, userId, { startDate, endDate });
    if (plans.length === 0) return [];

    const records = await fetchRecordsByPlanIds(
      this.supabase,
      userId,
      plans.map((plan) => plan.id),
    );

    return aggregateTagEstimationFactors(
      plans.map((plan) => ({
        id: plan.id,
        tag_id: plan.tag_id,
        planned_minutes: minutesBetween(plan.start_at, plan.end_at),
        is_skipped: plan.skipped_at != null,
      })),
      records.map((record) => ({
        plan_id: record.plan_id,
        source: record.source,
        minutes: minutesBetween(record.start_at, record.end_at),
      })),
    );
  }
}
