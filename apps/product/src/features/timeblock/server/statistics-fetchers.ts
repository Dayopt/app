import 'server-only';

/**
 * 統計 service 共通の行取得
 *
 * Aggregation Source Contract に従い、実績系は `records`、予定系は `plans` を読む。
 */

import { databaseTables } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';

import type { ServiceSupabaseClient } from './types';

export interface StatPlanRow {
  id: string;
  activity_id: string | null;
  start_at: string;
  end_at: string;
}

interface StatRecordRow {
  id: string;
  activity_id: string | null;
  plan_id: string | null;
  source: string;
  start_at: string;
  end_at: string;
}

/** 見積もり係数用の Plan 行。skip 判定に `skipped_at` を要するため専用 shape にする。 */
interface EstimationPlanRow extends StatPlanRow {
  skipped_at: string | null;
}

export interface ActivityLookupRow {
  id: string;
  name: string;
  /** カテゴリー未所属は null */
  category_id: string | null;
}

export interface CategoryLookupRow {
  id: string;
  name: string;
  /** 実 schema では nullable。色なしのカテゴリーがありうる */
  color: string | null;
  icon: string | null;
}

export interface DateRangeInput {
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export async function fetchRecords(
  supabase: ServiceSupabaseClient,
  userId: string,
  range: DateRangeInput = {},
): Promise<StatRecordRow[]> {
  let query = supabase
    .from(databaseTables.records)
    .select('id, activity_id, plan_id, source, start_at, end_at')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (range.startDate) query = query.gte('start_at', range.startDate);
  if (range.endDate) query = query.lt('start_at', range.endDate);

  const { data, error } = await query;
  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      feature: 'statistics',
      operation: 'fetch_records',
    });
  }
  return data ?? [];
}

export async function fetchRecordsByPlanIds(
  supabase: ServiceSupabaseClient,
  userId: string,
  planIds: string[],
): Promise<StatRecordRow[]> {
  const { data, error } = await supabase
    .from(databaseTables.records)
    .select('id, activity_id, plan_id, source, start_at, end_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('plan_id', planIds);
  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      feature: 'statistics',
      operation: 'fetch_records_by_plan_ids',
    });
  }
  return data ?? [];
}

export async function fetchPlans(
  supabase: ServiceSupabaseClient,
  userId: string,
  range: DateRangeInput = {},
): Promise<StatPlanRow[]> {
  let query = supabase
    .from('plans')
    .select('id, activity_id, start_at, end_at')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (range.startDate) query = query.gte('start_at', range.startDate);
  if (range.endDate) query = query.lt('start_at', range.endDate);

  const { data, error } = await query;
  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      feature: 'statistics',
      operation: 'fetch_plans',
    });
  }
  return data ?? [];
}

/**
 * 見積もり係数用の Plan 取得。`fetchPlans` と違い `skipped_at` を含める。
 *
 * `fetchPlans` 側に列を足さないのは、既存 consumer（Time P/L / 空白率 / 見積もり精度）が
 * skip 状態を見ない設計で、そこへ未使用列を流し込むと「使われている」と誤読されるため。
 */
export async function fetchPlansForEstimation(
  supabase: ServiceSupabaseClient,
  userId: string,
  range: DateRangeInput = {},
): Promise<EstimationPlanRow[]> {
  let query = supabase
    .from('plans')
    .select('id, activity_id, start_at, end_at, skipped_at')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (range.startDate) query = query.gte('start_at', range.startDate);
  if (range.endDate) query = query.lt('start_at', range.endDate);

  const { data, error } = await query;
  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      feature: 'statistics',
      operation: 'fetch_plans_for_estimation',
    });
  }
  return data ?? [];
}

export async function fetchActivitiesById(
  supabase: ServiceSupabaseClient,
  userId: string,
): Promise<Map<string, { id: string; name: string; category_id: string | null }>> {
  // is_active / archived_at では絞らない。過去の Plan / Record はアーカイブ済み
  // アクティビティを参照し続けるため、統計・過去表示では元の名前・所属を解決する必要がある（#1576）
  const { data, error } = await supabase
    .from('activities')
    .select('id, name, category_id')
    .eq('user_id', userId);
  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      feature: 'statistics',
      operation: 'fetch_activities',
    });
  }
  return new Map((data ?? []).map((activity) => [activity.id, activity]));
}

export async function fetchCategoriesById(
  supabase: ServiceSupabaseClient,
  userId: string,
): Promise<Map<string, { id: string; name: string; color: string | null; icon: string | null }>> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, color, icon')
    .eq('user_id', userId);
  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      feature: 'statistics',
      operation: 'fetch_categories',
    });
  }
  return new Map((data ?? []).map((category) => [category.id, category]));
}
