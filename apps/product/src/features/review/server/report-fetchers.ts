import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { databaseTables, type Database } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';

/**
 * レポート集計の行取得。
 *
 * **選択は半開区間の重なりで書く**（`start_at < rangeEnd AND end_at > rangeStart`）。
 * `start_at` だけで絞ると、期間境界を跨ぐブロック（日曜 23 時就寝 → 月曜 7 時起床）が
 * 開始側の期間へ全時間帰属し、跨いだ先からは丸ごと消える。これは
 * `features/timeblock/server/statistics-fetchers.ts` が抱える既知の不具合（#2426）で、
 * 新しい集計経路では最初から作らない。取得後の clip は `lib/report-period.ts` の
 * `clipMinutes` / `distributeToBuckets` が行う。
 *
 * `archived_at` では絞らない。アーカイブは未来にだけ効く操作で、過去の記録が消えるわけでは
 * ないため、期間内にインクがあるアクティビティは通常どおり集計対象にする。
 *
 * @public #2577 が消費するまで未接続（#2576 で先に集計だけ固めた）。
 */

export type ReportFetchClient = SupabaseClient<Database>;

/** @public #2577 が消費するまで未接続（#2576 で先に集計だけ固めた）。 */
export interface ReportRangeInput {
  startAt: string;
  endAt: string;
}

/** @public #2577 が消費するまで未接続（#2576 で先に集計だけ固めた）。 */
export interface ReportPlanRow {
  id: string;
  activity_id: string | null;
  start_at: string;
  end_at: string;
}

/** @public #2577 が消費するまで未接続（#2576 で先に集計だけ固めた）。 */
export interface ReportRecordRow {
  id: string;
  activity_id: string | null;
  start_at: string;
  end_at: string;
  fulfillment: string | null;
}

/** @public #2577 が消費するまで未接続（#2576 で先に集計だけ固めた）。 */
export interface ReportActivityRow {
  id: string;
  name: string;
  category_id: string | null;
  archived_at: string | null;
}

/** @public #2577 が消費するまで未接続（#2576 で先に集計だけ固めた）。 */
export interface ReportCategoryRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

function throwDatabaseError(error: unknown, operation: string): never {
  throw captureUnexpectedDatabaseError(error, { feature: 'report', operation });
}

/** 期間に重なる Record を取る。長さの clip は呼び出し側で行う。 */
export async function fetchReportRecords(
  supabase: ReportFetchClient,
  userId: string,
  range: ReportRangeInput,
): Promise<ReportRecordRow[]> {
  const { data, error } = await supabase
    .from(databaseTables.records)
    .select('id, activity_id, start_at, end_at, fulfillment')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .lt('start_at', range.endAt)
    .gt('end_at', range.startAt);

  if (error) throwDatabaseError(error, 'fetch_report_records');
  return data ?? [];
}

/** 期間に重なる Plan を取る。skip 済みは予定として計上しないので除外する。 */
export async function fetchReportPlans(
  supabase: ReportFetchClient,
  userId: string,
  range: ReportRangeInput,
): Promise<ReportPlanRow[]> {
  const { data, error } = await supabase
    .from(databaseTables.plans)
    .select('id, activity_id, start_at, end_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .is('skipped_at', null)
    .lt('start_at', range.endAt)
    .gt('end_at', range.startAt);

  if (error) throwDatabaseError(error, 'fetch_report_plans');
  return data ?? [];
}

/** アクティビティ全件。アーカイブ済みも含める（期間内にインクがあれば表示するため）。 */
export async function fetchReportActivities(
  supabase: ReportFetchClient,
  userId: string,
): Promise<ReportActivityRow[]> {
  const { data, error } = await supabase
    .from(databaseTables.activities)
    .select('id, name, category_id, archived_at')
    .eq('user_id', userId);

  if (error) throwDatabaseError(error, 'fetch_report_activities');
  return data ?? [];
}

/** カテゴリー全件。色とアイコンは表示側が semantic token へ写す。 */
export async function fetchReportCategories(
  supabase: ReportFetchClient,
  userId: string,
): Promise<ReportCategoryRow[]> {
  const { data, error } = await supabase
    .from(databaseTables.categories)
    .select('id, name, color, icon')
    .eq('user_id', userId);

  if (error) throwDatabaseError(error, 'fetch_report_categories');
  return data ?? [];
}
