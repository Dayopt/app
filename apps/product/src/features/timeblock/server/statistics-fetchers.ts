import 'server-only';

/**
 * 統計 service 共通の行取得
 *
 * Aggregation Source Contract に従い、実績系は `records`、予定系は `plans` を読む。
 */

import { databaseTables } from '@/lib/database';

import type { ServiceSupabaseClient } from './types';

export interface StatPlanRow {
  id: string;
  tag_id: string | null;
  start_at: string;
  end_at: string;
}

export interface StatRecordRow {
  id: string;
  tag_id: string | null;
  plan_id: string | null;
  source: string;
  start_at: string;
  end_at: string;
}

export interface TagLookupRow {
  id: string;
  name: string;
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
    .select('id, tag_id, plan_id, source, start_at, end_at')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (range.startDate) query = query.gte('start_at', range.startDate);
  if (range.endDate) query = query.lt('start_at', range.endDate);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch records: ${error.message}`);
  return data ?? [];
}

export async function fetchRecordsByPlanIds(
  supabase: ServiceSupabaseClient,
  userId: string,
  planIds: string[],
): Promise<StatRecordRow[]> {
  const { data, error } = await supabase
    .from(databaseTables.records)
    .select('id, tag_id, plan_id, source, start_at, end_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('plan_id', planIds);
  if (error) throw new Error(`Failed to fetch records by plan ids: ${error.message}`);
  return data ?? [];
}

export async function fetchPlans(
  supabase: ServiceSupabaseClient,
  userId: string,
  range: DateRangeInput = {},
): Promise<StatPlanRow[]> {
  let query = supabase
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

export async function fetchTagsById(
  supabase: ServiceSupabaseClient,
  userId: string,
): Promise<Map<string, TagLookupRow>> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color, icon')
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to fetch tags: ${error.message}`);
  return new Map((data ?? []).map((tag) => [tag.id, tag]));
}
