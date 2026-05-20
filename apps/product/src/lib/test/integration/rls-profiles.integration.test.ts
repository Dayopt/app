/**
 * RLS Integration Test: profiles テーブル
 *
 * Row Level Security (RLS) が正しく動作することを検証する。
 * E2E (rls-profiles.spec.ts) から移行。
 *
 * テストケース:
 * 1. ユーザーAは自分のプロフィールを閲覧できる
 * 2. ユーザーAは他人（ユーザーB）のプロフィールを閲覧できない
 * 3. ユーザーAは自分のプロフィールを更新できる
 * 4. ユーザーAは他人（ユーザーB）のプロフィールを更新できない
 * 5. ユーザーAは自分のプロフィールへのアクセス権限を持っている
 * 6. ユーザーAは他人（ユーザーB）のプロフィールを削除できない
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

const TEST_USER_A_ID = crypto.randomUUID();
const TEST_USER_B_ID = crypto.randomUUID();
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_INTEGRATION)('RLS: profiles テーブル', () => {
  let adminSupabase: ReturnType<typeof createClient<Database>>;
  let supabaseA: ReturnType<typeof createClient<Database>>;
  let supabaseB: ReturnType<typeof createClient<Database>>;

  const TEST_EMAIL_A = `test-rls-profile-a-${TEST_USER_A_ID}@example.com`;
  const TEST_EMAIL_B = `test-rls-profile-b-${TEST_USER_B_ID}@example.com`;
  const TEST_PASSWORD = 'test-password-123';

  beforeAll(async () => {
    // 管理者クライアント（RLSバイパス）
    adminSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ユーザーA作成
    const { error: authErrorA } = await adminSupabase.auth.admin.createUser({
      email: TEST_EMAIL_A,
      password: TEST_PASSWORD,
      email_confirm: true,
      id: TEST_USER_A_ID,
    });
    if (authErrorA && !authErrorA.message.includes('already exists')) {
      throw new Error(`Failed to create test user A: ${authErrorA.message}`);
    }

    await adminSupabase.from('profiles').upsert({
      id: TEST_USER_A_ID,
      email: TEST_EMAIL_A,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // ユーザーB作成
    const { error: authErrorB } = await adminSupabase.auth.admin.createUser({
      email: TEST_EMAIL_B,
      password: TEST_PASSWORD,
      email_confirm: true,
      id: TEST_USER_B_ID,
    });
    if (authErrorB && !authErrorB.message.includes('already exists')) {
      throw new Error(`Failed to create test user B: ${authErrorB.message}`);
    }

    await adminSupabase.from('profiles').upsert({
      id: TEST_USER_B_ID,
      email: TEST_EMAIL_B,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // ユーザーAクライアント
    supabaseA = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErrorA } = await supabaseA.auth.signInWithPassword({
      email: TEST_EMAIL_A,
      password: TEST_PASSWORD,
    });
    if (signInErrorA) {
      throw new Error(`Failed to sign in user A: ${signInErrorA.message}`);
    }

    // ユーザーBクライアント
    supabaseB = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErrorB } = await supabaseB.auth.signInWithPassword({
      email: TEST_EMAIL_B,
      password: TEST_PASSWORD,
    });
    if (signInErrorB) {
      throw new Error(`Failed to sign in user B: ${signInErrorB.message}`);
    }
  });

  afterAll(async () => {
    await supabaseA.auth.signOut();
    await supabaseB.auth.signOut();
    await adminSupabase.auth.admin.deleteUser(TEST_USER_A_ID);
    await adminSupabase.auth.admin.deleteUser(TEST_USER_B_ID);
  });

  it('ユーザーAは自分のプロフィールを閲覧できる', async () => {
    const { data, error } = await supabaseA
      .from('profiles')
      .select('*')
      .eq('id', TEST_USER_A_ID)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.id).toBe(TEST_USER_A_ID);
  });

  it('ユーザーAは他人（ユーザーB）のプロフィールを閲覧できない', async () => {
    const { data, error } = await supabaseA
      .from('profiles')
      .select('*')
      .eq('id', TEST_USER_B_ID)
      .single();

    // RLSによりデータが取得できない
    expect(data).toBeNull();
    expect(error?.code === 'PGRST116' || error === null).toBe(true);
  });

  it('ユーザーAは自分のプロフィールを更新できる', async () => {
    const newName = `Test User A Updated ${Date.now()}`;

    const { data, error } = await supabaseA
      .from('profiles')
      .update({ full_name: newName })
      .eq('id', TEST_USER_A_ID)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.full_name).toBe(newName);
  });

  it('ユーザーAは他人（ユーザーB）のプロフィールを更新できない', async () => {
    const { data } = await supabaseA
      .from('profiles')
      .update({ full_name: 'Hacked by User A' })
      .eq('id', TEST_USER_B_ID)
      .select();

    // RLSにより更新されない
    expect(data).toEqual([]);
  });

  it('ユーザーAは自分のプロフィールへのアクセス権限を持っている', async () => {
    // 削除は実行しない（テストユーザーが使えなくなるため）
    // SELECT権限で代替確認
    const { data } = await supabaseA.from('profiles').select('*').eq('id', TEST_USER_A_ID).single();

    expect(data).not.toBeNull();
    expect(data?.id).toBe(TEST_USER_A_ID);
  });

  it('ユーザーAは他人（ユーザーB）のプロフィールを削除できない', async () => {
    const { data } = await supabaseA.from('profiles').delete().eq('id', TEST_USER_B_ID).select();

    // RLSにより削除されない
    expect(data).toEqual([]);
  });
});
