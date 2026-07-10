/**
 * Step 4: 統計 TS service（`StatisticsService`）と旧 PL/pgSQL 統計 RPC の並走比較テスト。
 *
 * `entries` に実データを投入し `backfill_entries_to_plans_logs()` で `plans`/`logs`
 * を実体化した上で、旧 RPC と新 service の出力を突き合わせる。
 *
 * 意味論差の許容リスト（step-4-statistics-service.md の指示に基づく既知差分）:
 * - `get_time_by_tag` / `get_hourly_distribution` / `get_dow_distribution` は旧 RPC が
 *   `entries.start_time/end_time`（**予定**時間、planned origin のみ）を読むのに対し、
 *   新 service は Step 0 の Aggregation Source Contract どおり `logs`（**実績**、
 *   unplanned も含む）を読む。unplanned entry を含む集計では新の方が値が大きくなるのが
 *   意図した挙動（バグ修正）であり、比較対象からは意図的に除外する。
 * - `get_tag_stats.last_used` は旧 RPC が `MAX(created_at)`、新 service は
 *   `MAX(start_at)`（実際に記録した日時）を使う。後者がプロダクト的に正しい意味なので
 *   値の一致は検証しない。
 * - `source = 'auto_migrated'` の log は見積もり精度の分母から除外する
 *   （overview.md §8 未決 4 の決定）。
 * - 既知の凍結資産バグ: 旧 `get_time_by_tag` RPC は `hours` 列の型宣言
 *   （`double precision`）と実際の戻り値（`numeric`）が一致しておらず、
 *   ローカル DB では呼び出し自体が `structure of query does not match
 *   function result type` で失敗する（本 PR とは無関係の既存不具合）。
 *   このテストでは同 RPC との突き合わせは行わず、新 service 側の値のみを検証する。
 *
 * 実行方法:
 * 1. supabase start
 * 2. pnpm test:integration
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StatisticsService } from '@/features/entry/server/statistics-service';
import type { Database } from '@/lib/database';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SUPABASE_URL =
  process.env.USE_LOCAL_DB === 'true'
    ? LOCAL_DB_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL || LOCAL_DB_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_USER_ID = crypto.randomUUID();
const TEST_EMAIL = `test-${TEST_USER_ID}@example.com`;

const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

function daysAgo(days: number, hour = 10): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

describe.skipIf(SKIP_INTEGRATION)('StatisticsService vs 旧統計RPC 並走比較', () => {
  let admin: ReturnType<typeof createClient<Database>>;
  let service: StatisticsService;
  let tagAId: string;
  let tagBId: string;

  // E1: tagA, planned + 明示 actual（実績=予定と同じ時間） → plan + log(from_plan)
  const e1Start = daysAgo(5, 9);
  const e1End = addHours(e1Start, 1);
  // E4: tagA, planned + 明示 actual（別日、見積もり精度の分母 >=2 を満たすため）
  const e4Start = daysAgo(4, 9);
  const e4End = addHours(e4Start, 1);
  // E2: tagB, planned・actual なし・skip なし・過去 → auto-record（backfill で auto_migrated log 化）
  const e2Start = daysAgo(3, 14);
  const e2End = addHours(e2Start, 1);
  // E3: tagA, unplanned（旧 get_time_by_tag / hourly / dow の比較対象からは除外する既知差分）
  const e3Start = daysAgo(2, 20);
  const e3End = addHours(e3Start, 0.5);

  const rangeStart = daysAgo(10, 0).toISOString();
  const rangeEnd = daysAgo(-1, 0).toISOString();

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: 'test-password-123',
      email_confirm: true,
      id: TEST_USER_ID,
    });
    if (authError && !authError.message.includes('already exists')) {
      throw new Error(`Failed to create test user: ${authError.message}`);
    }
    await admin.from('profiles').upsert({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await admin.from('user_settings').upsert({ user_id: TEST_USER_ID, timezone: 'UTC' });

    const { data: tagA, error: tagAError } = await admin
      .from('tags')
      .insert({ user_id: TEST_USER_ID, name: 'Deep Work', color: 'blue', is_active: true })
      .select('id')
      .single();
    if (tagAError || !tagA) throw new Error(`Failed to create tagA: ${tagAError?.message}`);
    tagAId = tagA.id;

    const { data: tagB, error: tagBError } = await admin
      .from('tags')
      .insert({ user_id: TEST_USER_ID, name: 'Meeting', color: 'red', is_active: true })
      .select('id')
      .single();
    if (tagBError || !tagB) throw new Error(`Failed to create tagB: ${tagBError?.message}`);
    tagBId = tagB.id;

    const { error: insertError } = await admin.from('entries').insert([
      {
        user_id: TEST_USER_ID,
        tag_id: tagAId,
        title: 'E1 planned+recorded',
        origin: 'planned',
        start_time: e1Start.toISOString(),
        end_time: e1End.toISOString(),
        actual_start_time: e1Start.toISOString(),
        actual_end_time: e1End.toISOString(),
        fulfillment_score: 3,
      },
      {
        user_id: TEST_USER_ID,
        tag_id: tagAId,
        title: 'E4 planned+recorded',
        origin: 'planned',
        start_time: e4Start.toISOString(),
        end_time: e4End.toISOString(),
        actual_start_time: e4Start.toISOString(),
        actual_end_time: e4End.toISOString(),
        fulfillment_score: 2,
      },
      {
        user_id: TEST_USER_ID,
        tag_id: tagBId,
        title: 'E2 auto-record',
        origin: 'planned',
        start_time: e2Start.toISOString(),
        end_time: e2End.toISOString(),
      },
      {
        user_id: TEST_USER_ID,
        tag_id: tagAId,
        title: 'E3 unplanned',
        origin: 'unplanned',
        actual_start_time: e3Start.toISOString(),
        actual_end_time: e3End.toISOString(),
        fulfillment_score: 1,
      },
    ]);
    if (insertError) throw new Error(`Failed to insert entries: ${insertError.message}`);

    const { error: backfillError } = await admin.rpc('backfill_entries_to_plans_logs');
    if (backfillError) throw new Error(`Backfill failed: ${backfillError.message}`);

    service = new StatisticsService(admin);
  });

  afterAll(async () => {
    await admin.from('entries').delete().eq('user_id', TEST_USER_ID);
    await admin.from('logs').delete().eq('user_id', TEST_USER_ID);
    await admin.from('plans').delete().eq('user_id', TEST_USER_ID);
    await admin.from('tags').delete().eq('user_id', TEST_USER_ID);
    await admin.auth.admin.deleteUser(TEST_USER_ID);
  });

  it('backfill が plans 3件・logs 4件を実体化する', async () => {
    const { data: plans } = await admin.from('plans').select('id').eq('user_id', TEST_USER_ID);
    const { data: logs } = await admin
      .from('logs')
      .select('id, source')
      .eq('user_id', TEST_USER_ID);
    expect(plans).toHaveLength(3); // E1, E4, E2
    expect(logs).toHaveLength(4); // E1(from_plan), E4(from_plan), E2(auto_migrated), E3(manual)
    expect(logs?.filter((l) => l.source === 'auto_migrated')).toHaveLength(1);
  });

  it('getTagStats: 実績(logs)ベースの件数が旧 RPC と一致する（この投入データでは deleted 行が無いため一致）', async () => {
    const { data: oldRows, error } = await admin.rpc('get_tag_stats', { p_user_id: TEST_USER_ID });
    if (error) throw error;
    const oldCounts = Object.fromEntries((oldRows ?? []).map((r) => [r.tag_id, r.entry_count]));

    const newResult = await service.getTagStats(TEST_USER_ID);

    // tagA: E1,E4,E3 → 3 logs / tagB: E2(auto_migrated) → 1 log
    expect(newResult.counts).toEqual({ [tagAId]: 3, [tagBId]: 1 });
    expect(oldCounts).toEqual({ [tagAId]: 3, [tagBId]: 1 });
  });

  it('getTimeByTag: 実績(logs)ベースのタグ別合計時間を返す', async () => {
    // NOTE: 旧 `get_time_by_tag` RPC は本 PR と無関係の既存バグ（`hours` 列が
    // numeric を double precision として RETURNS TABLE 宣言しており
    // "structure of query does not match function result type" で例外になる）
    // により、この worktree のローカル DB では呼び出し自体が失敗する。
    // 凍結資産のため本 Step では修正せず、旧 RPC との突き合わせは断念して
    // 新 service 側の値のみを検証する（別途フォローアップとして報告）。
    const newRows = await service.getTimeByTag(TEST_USER_ID, {
      startDate: rangeStart,
      endDate: rangeEnd,
    });
    const newByTag = Object.fromEntries(newRows.map((r) => [r.tagId, r.hours]));

    // tagA: E1(1h) + E4(1h) + E3(0.5h, unplanned) = 2.5h
    expect(newByTag[tagAId]).toBeCloseTo(2.5, 6);
    // tagB: E2(auto_migrated, 1h) のみ
    expect(newByTag[tagBId]).toBeCloseTo(1, 6);
  });

  it('getBlankRate: plans ベースの scheduled minutes が旧 RPC の scheduledMinutes と一致する', async () => {
    const wakeHour = 7;
    const sleepHour = 23;
    const { data: oldResult, error } = await admin.rpc('get_blank_rate', {
      p_user_id: TEST_USER_ID,
      p_start_date: rangeStart,
      p_end_date: rangeEnd,
      p_wake_hour: wakeHour,
      p_sleep_hour: sleepHour,
    });
    if (error) throw error;

    const newResult = await service.getBlankRate(TEST_USER_ID, {
      startDate: rangeStart,
      endDate: rangeEnd,
      wakeHour,
      sleepHour,
    });

    // E1+E4+E2 の予定時間のみが対象（E3 は unplanned で予定時間を持たない）→ 旧・新で一致する
    const old = oldResult as { scheduledMinutes: number; availableMinutes: number };
    expect(newResult.scheduledMinutes).toBeCloseTo(old.scheduledMinutes, 6);
    expect(newResult.availableMinutes).toBe(old.availableMinutes);
  });

  it('getEstimationAccuracy: auto_migrated を除外した 1:N 集計が旧 RPC の explicit-actual 集計と一致する', async () => {
    const { data: oldRows, error } = await admin.rpc('get_estimation_accuracy', {
      p_user_id: TEST_USER_ID,
      p_start_date: rangeStart,
      p_end_date: rangeEnd,
    });
    if (error) throw error;

    const newRows = await service.getEstimationAccuracy(TEST_USER_ID, {
      startDate: rangeStart,
      endDate: rangeEnd,
    });

    // tagA: E1・E4 とも明示 actual = 予定と同じ時間 → 旧・新とも deviation=0 で一致する。
    // tagB: auto_migrated 1 件のみのため HAVING COUNT(*)>=2 を満たさず旧・新とも該当なし。
    const oldTagA = (oldRows ?? []).find((r) => r.tag_id === tagAId);
    const newTagA = newRows.find((r) => r.tagId === tagAId);

    expect(oldTagA).toBeDefined();
    expect(newTagA).toBeDefined();
    expect(newTagA?.entryCount).toBe(oldTagA?.entry_count);
    expect(newTagA?.avgPlannedMinutes).toBeCloseTo(oldTagA?.avg_planned_minutes ?? 0, 6);
    expect(newTagA?.avgActualMinutes).toBeCloseTo(oldTagA?.avg_actual_minutes ?? 0, 6);
    expect(newTagA?.avgDeviationMinutes).toBeCloseTo(0, 6);

    expect((oldRows ?? []).find((r) => r.tag_id === tagBId)).toBeUndefined();
    expect(newRows.find((r) => r.tagId === tagBId)).toBeUndefined();
  });

  it('getActiveDates: 実績(logs)が存在する日付一覧を返す', async () => {
    const dates = await service.getActiveDates(TEST_USER_ID, rangeStart);
    // E1, E4, E2, E3 は 4 つの異なる日付に記録されている
    expect(dates).toHaveLength(4);
    expect(dates).toEqual([...dates].sort());
  });
});
