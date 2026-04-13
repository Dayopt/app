/**
 * RLS Integration Test: login_attempts テーブル
 *
 * Row Level Security (RLS) が正しく動作することを検証する。
 * E2E (rls-login-attempts.spec.ts) から移行。
 *
 * テストケース:
 * 1. 通常ユーザーはlogin_attemptsを閲覧できない
 * 2. システムはログイン試行を記録できる（未認証でもOK）
 * 3. 管理者（Service Role）はすべてのlogin_attemptsを閲覧できる
 * 4. 通常ユーザーはlogin_attemptsを更新できない
 * 5. 通常ユーザーはlogin_attemptsを削除できない
 *
 * @see Issue #615 - E2Eテスト追加（RLS検証）
 * @see Issue #611 - RLS完全実装
 * @see Storybook → Docs/テスト戦略 - E2E→Integration移行
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database.types';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SUPABASE_URL =
  process.env.USE_LOCAL_DB === 'true'
    ? LOCAL_DB_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL || LOCAL_DB_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const TEST_USER_ID = crypto.randomUUID();
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_INTEGRATION)('RLS: login_attempts テーブル', () => {
  let adminSupabase: ReturnType<typeof createClient<Database>>;
  let userSupabase: ReturnType<typeof createClient<Database>>;
  let anonSupabase: ReturnType<typeof createClient<Database>>;

  const TEST_EMAIL = `test-rls-login-${TEST_USER_ID}@example.com`;
  const TEST_PASSWORD = 'test-password-123';

  // テスト中に挿入したlogin_attemptのIDを追跡
  const insertedAttemptIds: string[] = [];

  beforeAll(async () => {
    // 管理者クライアント（RLSバイパス）
    adminSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // テストユーザー作成
    const { error: authError } = await adminSupabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      id: TEST_USER_ID,
    });

    if (authError && !authError.message.includes('already exists')) {
      throw new Error(`Failed to create test user: ${authError.message}`);
    }

    // プロフィール作成
    await adminSupabase.from('profiles').upsert({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      username: `testuser_rls_login_${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 通常ユーザークライアント
    userSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await userSupabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (signInError) {
      throw new Error(`Failed to sign in test user: ${signInError.message}`);
    }

    // 未認証クライアント
    anonSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    // テストデータクリーンアップ
    if (insertedAttemptIds.length > 0) {
      await adminSupabase.from('login_attempts').delete().in('id', insertedAttemptIds);
    }

    await userSupabase.auth.signOut();
    await adminSupabase.auth.admin.deleteUser(TEST_USER_ID);
  });

  it('通常ユーザーはlogin_attemptsを閲覧できない', async () => {
    const { data } = await userSupabase.from('login_attempts').select('*');

    // RLSによりデータが取得できない
    expect(data).toEqual([]);
  });

  it('システムはログイン試行を記録できる（未認証でもOK）', async () => {
    const testEmail = `test-login-${Date.now()}@example.com`;

    const { data, error } = await anonSupabase
      .from('login_attempts')
      .insert({
        email: testEmail,
        attempt_time: new Date().toISOString(),
        is_successful: false,
        ip_address: '127.0.0.1',
        user_agent: 'Vitest Integration Test',
      })
      .select();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.[0]?.email).toBe(testEmail);

    // クリーンアップ用にID記録
    if (data?.[0]?.id) {
      insertedAttemptIds.push(data[0].id);
    }
  });

  it('管理者（Service Role）はすべてのlogin_attemptsを閲覧できる', async () => {
    const { data, error } = await adminSupabase.from('login_attempts').select('*').limit(10);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('通常ユーザーはlogin_attemptsを更新できない', async () => {
    // テストデータを挿入（未認証で）
    const testEmail = `test-update-${Date.now()}@example.com`;
    const { data: insertData, error: insertError } = await anonSupabase
      .from('login_attempts')
      .insert({
        email: testEmail,
        attempt_time: new Date().toISOString(),
        is_successful: false,
        ip_address: '127.0.0.1',
        user_agent: 'Vitest Integration Test',
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(insertData).not.toBeNull();

    const attemptId = insertData!.id;
    insertedAttemptIds.push(attemptId);

    // 通常ユーザーで更新を試みる
    const { data } = await userSupabase
      .from('login_attempts')
      .update({ is_successful: true })
      .eq('id', attemptId)
      .select();

    // RLSにより更新されない
    expect(data).toEqual([]);
  });

  it('通常ユーザーはlogin_attemptsを削除できない', async () => {
    // テストデータを挿入（未認証で）
    const testEmail = `test-delete-${Date.now()}@example.com`;
    const { data: insertData, error: insertError } = await anonSupabase
      .from('login_attempts')
      .insert({
        email: testEmail,
        attempt_time: new Date().toISOString(),
        is_successful: false,
        ip_address: '127.0.0.1',
        user_agent: 'Vitest Integration Test',
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(insertData).not.toBeNull();

    const attemptId = insertData!.id;
    insertedAttemptIds.push(attemptId);

    // 通常ユーザーで削除を試みる
    const { data } = await userSupabase
      .from('login_attempts')
      .delete()
      .eq('id', attemptId)
      .select();

    // RLSにより削除されない
    expect(data).toEqual([]);
  });
});
