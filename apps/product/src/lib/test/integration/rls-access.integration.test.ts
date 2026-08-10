import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const TEST_USER_A_ID = crypto.randomUUID();
const TEST_USER_B_ID = crypto.randomUUID();
const TEST_USER_B_PLAN_ID = crypto.randomUUID();
const TEST_USER_B_RECORD_ID = crypto.randomUUID();
const RPC_BATCH_TAG_ID = crypto.randomUUID();
const RPC_REORDER_TAG_ID = crypto.randomUUID();
const RPC_PARENT_TAG_ID = crypto.randomUUID();
const RPC_GROUP_TAG_ID = crypto.randomUUID();
const RPC_MERGE_SOURCE_TAG_ID = crypto.randomUUID();
const RPC_MERGE_TARGET_TAG_ID = crypto.randomUUID();
const RPC_FOREIGN_CHILD_TAG_ID = crypto.randomUUID();
const RPC_SOFT_DELETE_PLAN_ID = crypto.randomUUID();
const RPC_CONFIRM_PLAN_ID = crypto.randomUUID();
const RPC_RESTORE_PLAN_ID = crypto.randomUUID();
const RPC_SOFT_DELETE_RECORD_ID = crypto.randomUUID();
const RPC_RESTORE_RECORD_ID = crypto.randomUUID();
const RPC_AUTO_ACTIVE_RECORD_ID = crypto.randomUUID();
const RPC_AUTO_DELETED_RECORD_ID = crypto.randomUUID();
const RPC_COUNT_CODE_ID = crypto.randomUUID();
const RPC_USE_CODE_ID = crypto.randomUUID();
const RPC_COUNT_CODE_HASH = `rpc-count-${crypto.randomUUID()}`;
const RPC_USE_CODE_HASH = `rpc-use-${crypto.randomUUID()}`;
const CALENDAR_CONNECTION_ID = crypto.randomUUID();
const CALENDAR_CONNECTION_CALENDAR_ID = crypto.randomUUID();
/** calendar_connections で authenticated に GRANT SELECT されている列（migration 20260723233814 と対応） */
const CALENDAR_CONNECTION_GRANTED_COLUMNS = [
  'id',
  'user_id',
  'provider',
  'provider_account_email',
  'status',
  'last_synced_at',
  'last_sync_error',
  'created_at',
  'updated_at',
] as const;
/** authenticated から読めてはいけない列 */
const CALENDAR_CONNECTION_WITHHELD_COLUMNS = [
  'refresh_token_enc',
  'granted_scopes',
  'provider_account_id',
] as const;
const TEST_EMAIL_A = `test-rls-a-${TEST_USER_A_ID}@example.com`;
const TEST_EMAIL_B = `test-rls-b-${TEST_USER_B_ID}@example.com`;
const TEST_PASSWORD = 'test-password-123';
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';
const ACCESS_DENIED_MESSAGE = 'Access denied: user_id mismatch';
const RPC_TIME_ANCHOR = Date.now();
const isoAtRpcOffset = (offsetMs: number) => new Date(RPC_TIME_ANCHOR + offsetMs).toISOString();
const TEST_USER_B_PLAN_START_AT = isoAtRpcOffset(24 * 60 * 60_000);
const TEST_USER_B_PLAN_END_AT = isoAtRpcOffset(25 * 60 * 60_000);
const RPC_SOFT_DELETE_PLAN_START_AT = isoAtRpcOffset(4 * 60 * 60_000);
const RPC_SOFT_DELETE_PLAN_END_AT = isoAtRpcOffset(5 * 60 * 60_000);
const RPC_RESTORE_PLAN_START_AT = isoAtRpcOffset(6 * 60 * 60_000);
const RPC_RESTORE_PLAN_END_AT = isoAtRpcOffset(7 * 60 * 60_000);
let rpcConfirmPlanStartAt = '';
let rpcConfirmPlanEndAt = '';
let rpcConfirmRangeStartAt = '';
let rpcConfirmRangeEndAt = '';
let rpcConfirmedAt = '';

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const supabaseA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const supabaseB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type UserOwnedRlsCase = {
  table: string;
  idColumn: string;
  rowId: string;
  seed: () => Promise<void>;
  update: Record<string, unknown>;
};

const userOwnedCases: UserOwnedRlsCase[] = [
  {
    table: 'profiles',
    idColumn: 'id',
    rowId: TEST_USER_B_ID,
    seed: async () => undefined,
    update: { full_name: 'foreign update' },
  },
  {
    table: 'plans',
    idColumn: 'id',
    rowId: TEST_USER_B_PLAN_ID,
    seed: async function () {
      const { error } = await adminSupabase.from('plans').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        title: 'RLS plan',
        source: 'manual',
        start_at: TEST_USER_B_PLAN_START_AT,
        end_at: TEST_USER_B_PLAN_END_AT,
      });
      if (error) throw error;
    },
    update: { title: 'foreign update' },
  },
  {
    table: 'records',
    idColumn: 'id',
    rowId: TEST_USER_B_RECORD_ID,
    seed: async function () {
      const { error } = await adminSupabase.from('records').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        title: 'RLS record',
        source: 'manual',
        start_at: '2026-06-15T11:00:00.000Z',
        end_at: '2026-06-15T12:00:00.000Z',
      });
      if (error) throw error;
    },
    update: { title: 'foreign update' },
  },
  {
    table: 'tags',
    idColumn: 'id',
    rowId: crypto.randomUUID(),
    seed: async function () {
      const { error } = await adminSupabase.from('tags').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        name: 'RLS tag',
      });
      if (error) throw error;
    },
    update: { name: 'foreign update' },
  },
  {
    table: 'user_settings',
    idColumn: 'user_id',
    rowId: TEST_USER_B_ID,
    seed: async () => {
      const { error } = await adminSupabase
        .from('user_settings')
        .upsert({ user_id: TEST_USER_B_ID });
      if (error) throw error;
    },
    update: { theme: 'dark' },
  },
  {
    table: 'mfa_recovery_codes',
    idColumn: 'id',
    rowId: crypto.randomUUID(),
    seed: async function () {
      const { error } = await adminSupabase.from('mfa_recovery_codes').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        code_hash: `rls-${this.rowId}`,
      });
      if (error) throw error;
    },
    update: { used_at: new Date().toISOString() },
  },
  {
    table: 'reports',
    idColumn: 'id',
    rowId: crypto.randomUUID(),
    seed: async function () {
      const { error } = await adminSupabase.from('reports').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        period_type: 'week',
        period_start: '2026-06-01',
        period_end: '2026-06-07',
        summary: 'RLS report',
        content: {},
      });
      if (error) throw error;
    },
    update: { summary: 'foreign update' },
  },
  {
    table: 'oauth_tokens',
    idColumn: 'id',
    rowId: crypto.randomUUID(),
    seed: async function () {
      const { error } = await adminSupabase.from('oauth_tokens').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        client_id: 'unknown',
        token_hash: `rls-${this.rowId}`,
        token_type: 'access',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      if (error) throw error;
    },
    update: { last_used_at: new Date().toISOString() },
  },
  {
    table: 'oauth_audit_log',
    idColumn: 'id',
    rowId: crypto.randomUUID(),
    seed: async function () {
      const { error } = await adminSupabase.from('oauth_audit_log').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        client_id: 'unknown',
        tool_name: 'rls_test',
      });
      if (error) throw error;
    },
    update: { tool_name: 'foreign_update' },
  },
];

/**
 * owner でも直接 mutation できず、service-owned な経路（typed RPC / command）だけが
 * 書けるユーザーデータ table。plans / records は Candidate 6 の ACL cutover で加わった。
 */
const SERVICE_OWNED_USER_TABLE_MUTATIONS = new Set([
  'oauth_tokens',
  'oauth_audit_log',
  'plans',
  'records',
]);

const serviceRoleCases = [
  {
    table: 'stripe_webhook_events',
    idColumn: 'id',
    rowId: crypto.randomUUID(),
    seed: {
      event_id: `evt_rls_${crypto.randomUUID()}`,
      event_type: 'test.event',
    },
    unauthorizedInsert: () => ({
      id: crypto.randomUUID(),
      event_id: `evt_rls_${crypto.randomUUID()}`,
      event_type: 'test.event',
    }),
    update: { event_type: 'foreign update' },
  },
  {
    table: 'email_suppressions',
    idColumn: 'id',
    rowId: crypto.randomUUID(),
    seed: {
      email: `rls-${crypto.randomUUID()}@example.com`,
      reason: 'bounce',
    },
    unauthorizedInsert: () => ({
      id: crypto.randomUUID(),
      email: `rls-${crypto.randomUUID()}@example.com`,
      reason: 'bounce',
    }),
    update: { reason: 'complaint' },
  },
  {
    table: 'oauth_authorization_codes',
    idColumn: 'code_hash',
    rowId: `rls-${crypto.randomUUID()}`,
    seed: {
      user_id: TEST_USER_B_ID,
      client_id: 'unknown',
      redirect_uri: 'https://example.com/oauth/callback',
      code_challenge: 'rls-code-challenge',
      code_challenge_method: 'S256',
      scopes: ['read:entries'],
    },
    unauthorizedInsert: () => ({
      code_hash: `rls-${crypto.randomUUID()}`,
      user_id: TEST_USER_A_ID,
      client_id: 'unknown',
      redirect_uri: 'https://example.com/oauth/callback',
      code_challenge: 'rls-code-challenge',
      code_challenge_method: 'S256',
      scopes: ['read:entries'],
    }),
    update: { consumed_at: new Date().toISOString() },
  },
];

async function createUser(id: string, email: string) {
  const { error } = await adminSupabase.auth.admin.createUser({
    id,
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
}

describe.skipIf(SKIP_INTEGRATION)('RLS access matrix', () => {
  beforeAll(async () => {
    await createUser(TEST_USER_A_ID, TEST_EMAIL_A);
    await createUser(TEST_USER_B_ID, TEST_EMAIL_B);

    const { error: signInErrorA } = await supabaseA.auth.signInWithPassword({
      email: TEST_EMAIL_A,
      password: TEST_PASSWORD,
    });
    if (signInErrorA) throw signInErrorA;

    const { error: signInErrorB } = await supabaseB.auth.signInWithPassword({
      email: TEST_EMAIL_B,
      password: TEST_PASSWORD,
    });
    if (signInErrorB) throw signInErrorB;

    for (const testCase of userOwnedCases) {
      await testCase.seed();
    }
    for (const testCase of serviceRoleCases) {
      const { error } = await adminSupabase
        .from(testCase.table)
        .insert({ [testCase.idColumn]: testCase.rowId, ...testCase.seed });
      if (error) throw error;
    }
  });

  afterAll(async () => {
    for (const testCase of serviceRoleCases) {
      await adminSupabase.from(testCase.table).delete().eq(testCase.idColumn, testCase.rowId);
    }
    for (const testCase of [...userOwnedCases].reverse()) {
      if (testCase.table !== 'profiles') {
        await adminSupabase.from(testCase.table).delete().eq(testCase.idColumn, testCase.rowId);
      }
    }
    await supabaseA.auth.signOut();
    await supabaseB.auth.signOut();
    await adminSupabase.auth.admin.deleteUser(TEST_USER_A_ID);
    await adminSupabase.auth.admin.deleteUser(TEST_USER_B_ID);
  });

  describe.each(userOwnedCases)('$table', (testCase) => {
    it('ownerは自分の行をselectできる', async () => {
      const { data, error } = await supabaseB
        .from(testCase.table)
        .select(testCase.idColumn)
        .eq(testCase.idColumn, testCase.rowId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it.each(['select', 'update', 'delete'] as const)(
      '他ユーザーの%sを拒否する',
      async (operation) => {
        let query = supabaseA
          .from(testCase.table)
          .select(testCase.idColumn)
          .eq(testCase.idColumn, testCase.rowId);
        if (operation === 'update') {
          query = supabaseA
            .from(testCase.table)
            .update(testCase.update)
            .eq(testCase.idColumn, testCase.rowId)
            .select();
        } else if (operation === 'delete') {
          query = supabaseA
            .from(testCase.table)
            .delete()
            .eq(testCase.idColumn, testCase.rowId)
            .select();
        }

        const { data, error } = await query;
        const isPrivilegeDeniedMutation =
          (operation !== 'select' && SERVICE_OWNED_USER_TABLE_MUTATIONS.has(testCase.table)) ||
          (operation === 'delete' && testCase.table === 'profiles');
        if (isPrivilegeDeniedMutation) {
          expect(error?.code).toBe('42501');
          return;
        }
        expect(error).toBeNull();
        expect(data).toEqual([]);
      },
    );
  });

  // Candidate 6: plans / records の authenticated 直接 DML を剥がし、SELECT だけ残した。
  // RLS policy は残っているが grant 層で到達不能になるため、insert/update/delete は
  // policy 評価より前に 42501 で落ちる。
  it('authenticatedはown Plan / Recordをreadできるが直接writeできない', async () => {
    const [planInsert, recordInsert, planUpdate, recordUpdate, planDelete, recordDelete] =
      await Promise.all([
        supabaseB.from('plans').insert({
          id: crypto.randomUUID(),
          user_id: TEST_USER_B_ID,
          title: 'Forbidden direct Plan',
          source: 'manual',
          start_at: isoAtRpcOffset(48 * 60 * 60_000),
          end_at: isoAtRpcOffset(49 * 60 * 60_000),
        }),
        supabaseB.from('records').insert({
          id: crypto.randomUUID(),
          user_id: TEST_USER_B_ID,
          title: 'Forbidden direct Record',
          source: 'manual',
          start_at: '2026-01-20T00:00:00.000Z',
          end_at: '2026-01-20T01:00:00.000Z',
        }),
        supabaseB
          .from('plans')
          .update({ title: 'Forbidden Plan update' })
          .eq('id', TEST_USER_B_PLAN_ID),
        supabaseB
          .from('records')
          .update({ title: 'Forbidden Record update' })
          .eq('id', TEST_USER_B_RECORD_ID),
        supabaseB.from('plans').delete().eq('id', TEST_USER_B_PLAN_ID),
        supabaseB.from('records').delete().eq('id', TEST_USER_B_RECORD_ID),
      ]);

    for (const result of [
      planInsert,
      recordInsert,
      planUpdate,
      recordUpdate,
      planDelete,
      recordDelete,
    ]) {
      expect(result.error?.code).toBe('42501');
    }

    const [{ data: plan, error: planReadError }, { data: record, error: recordReadError }] =
      await Promise.all([
        supabaseB.from('plans').select('title').eq('id', TEST_USER_B_PLAN_ID).single(),
        supabaseB.from('records').select('title').eq('id', TEST_USER_B_RECORD_ID).single(),
      ]);
    expect(planReadError).toBeNull();
    expect(recordReadError).toBeNull();
    expect(plan?.title).toBe('RLS plan');
    expect(record?.title).toBe('RLS record');
  });

  describe('profiles deletion grants', () => {
    it('ownerでもprofileを直接deleteできない', async () => {
      const { error } = await supabaseB
        .from('profiles')
        .delete()
        .eq('id', TEST_USER_B_ID)
        .select('id');

      expect(error?.code).toBe('42501');

      const { data: profile, error: profileError } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('id', TEST_USER_B_ID)
        .single();

      expect(profileError).toBeNull();
      expect(profile?.id).toBe(TEST_USER_B_ID);
    });
  });

  describe('OAuth token column grants', () => {
    it('ownerでもtoken_hash列は読めない', async () => {
      const tokenCase = userOwnedCases.find((testCase) => testCase.table === 'oauth_tokens');
      if (!tokenCase) throw new Error('oauth_tokens RLS fixture is missing');

      const { error } = await supabaseB
        .from('oauth_tokens')
        .select('token_hash')
        .eq('id', tokenCase.rowId);

      expect(error?.code).toBe('42501');
    });
  });

  describe('profiles billing column grants', () => {
    it('ownerでもbilling entitlement columnsを直接更新できない', async () => {
      const { error } = await supabaseB
        .from('profiles')
        .update({
          stripe_customer_id: `cus_forbidden_${crypto.randomUUID()}`,
          subscription_id: `sub_forbidden_${crypto.randomUUID()}`,
          subscription_status: 'active',
        })
        .eq('id', TEST_USER_B_ID);

      expect(error?.code).toBe('42501');

      const { data, error: readError } = await adminSupabase
        .from('profiles')
        .select('stripe_customer_id, subscription_id, subscription_status')
        .eq('id', TEST_USER_B_ID)
        .single();

      expect(readError).toBeNull();
      expect(data?.stripe_customer_id).toBeNull();
      expect(data?.subscription_id).toBeNull();
      expect(data?.subscription_status).toBe('free');
    });

    it('ownerはprofile presentation columnsを更新できる', async () => {
      const { error } = await supabaseB
        .from('profiles')
        .update({ full_name: 'RLS profile owner update', avatar_url: null })
        .eq('id', TEST_USER_B_ID);

      expect(error).toBeNull();
    });

    it('service_roleはStripe webhook経路としてbilling entitlement columnsを更新できる', async () => {
      const stripeCustomerId = `cus_allowed_${crypto.randomUUID()}`;
      const subscriptionId = `sub_allowed_${crypto.randomUUID()}`;

      const { error } = await adminSupabase
        .from('profiles')
        .update({
          stripe_customer_id: stripeCustomerId,
          subscription_id: subscriptionId,
          subscription_status: 'active',
        })
        .eq('id', TEST_USER_B_ID);

      expect(error).toBeNull();

      const { data, error: readError } = await adminSupabase
        .from('profiles')
        .select('stripe_customer_id, subscription_id, subscription_status')
        .eq('id', TEST_USER_B_ID)
        .single();

      expect(readError).toBeNull();
      expect(data).toMatchObject({
        stripe_customer_id: stripeCustomerId,
        subscription_id: subscriptionId,
        subscription_status: 'active',
      });

      const { error: resetError } = await adminSupabase
        .from('profiles')
        .update({
          stripe_customer_id: null,
          subscription_id: null,
          subscription_status: 'free',
        })
        .eq('id', TEST_USER_B_ID);

      expect(resetError).toBeNull();
    });
  });

  // calendar_connections は repo 初の column-scoped SELECT。userOwnedCases /
  // serviceRoleCases のどちらの共通ブロックにも当てはまらないため独立させる
  // （前者は select('*') と update/delete が error null を期待し、後者は
  // "No browser client access" policy の件数と結びついている）。
  //
  // production の pg_default_acl は新規 public テーブルに anon/authenticated へ
  // arwdDxtm を撒くが local は Dxtm しか撒かない。REVOKE 漏れは local 由来の
  // rls:snapshot では検出できないので、ここと migration 内の invariant が gate になる。
  describe('calendar connection column grants', () => {
    beforeAll(async () => {
      const { error: connectionError } = await adminSupabase.from('calendar_connections').insert({
        id: CALENDAR_CONNECTION_ID,
        user_id: TEST_USER_B_ID,
        provider: 'google',
        provider_account_id: `sub-${CALENDAR_CONNECTION_ID}`,
        provider_account_email: TEST_EMAIL_B,
        granted_scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        refresh_token_enc: 'rls-ciphertext',
        status: 'active',
      });
      if (connectionError) throw connectionError;

      const { error: calendarError } = await adminSupabase
        .from('calendar_connection_calendars')
        .insert({
          id: CALENDAR_CONNECTION_CALENDAR_ID,
          connection_id: CALENDAR_CONNECTION_ID,
          user_id: TEST_USER_B_ID,
          provider_calendar_id: 'primary',
          calendar_name: 'RLS calendar',
          sync_token: 'rls-sync-token',
        });
      if (calendarError) throw calendarError;
    });

    afterAll(async () => {
      // 子は複合 FK の ON DELETE CASCADE で消える
      await adminSupabase.from('calendar_connections').delete().eq('id', CALENDAR_CONNECTION_ID);
    });

    it('ownerはgrant済みの列だけを明示指定して自分の接続を読める', async () => {
      const { data, error } = await supabaseB
        .from('calendar_connections')
        .select(CALENDAR_CONNECTION_GRANTED_COLUMNS.join(', '))
        .eq('id', CALENDAR_CONNECTION_ID);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("ownerでもselect('*')は列権限で拒否される", async () => {
      const { error } = await supabaseB
        .from('calendar_connections')
        .select('*')
        .eq('id', CALENDAR_CONNECTION_ID);

      expect(error?.code).toBe('42501');
    });

    it.each(CALENDAR_CONNECTION_WITHHELD_COLUMNS)('ownerでも%s列は読めない', async (column) => {
      const { error } = await supabaseB
        .from('calendar_connections')
        .select(column)
        .eq('id', CALENDAR_CONNECTION_ID);

      expect(error?.code).toBe('42501');
    });

    it('未grant列をfilterに使うクエリも拒否される', async () => {
      const { error } = await supabaseB
        .from('calendar_connections')
        .select('id')
        .eq('provider_account_id', `sub-${CALENDAR_CONNECTION_ID}`);

      expect(error?.code).toBe('42501');
    });

    it('他ユーザーの接続はRLSで0件になる', async () => {
      const { data, error } = await supabaseA
        .from('calendar_connections')
        .select('id')
        .eq('id', CALENDAR_CONNECTION_ID);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it.each(['insert', 'update', 'delete'] as const)(
      'authenticated clientの%sを拒否する',
      async (operation) => {
        if (operation === 'insert') {
          const { error } = await supabaseB.from('calendar_connections').insert({
            user_id: TEST_USER_B_ID,
            provider: 'google',
            provider_account_id: `sub-forbidden-${crypto.randomUUID()}`,
            granted_scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
            refresh_token_enc: 'forbidden',
            status: 'active',
          });
          expect(error?.code).toBe('42501');
          return;
        }

        const { error } =
          operation === 'update'
            ? await supabaseB
                .from('calendar_connections')
                .update({ status: 'reauth_required' })
                .eq('id', CALENDAR_CONNECTION_ID)
            : await supabaseB
                .from('calendar_connections')
                .delete()
                .eq('id', CALENDAR_CONNECTION_ID);

        expect(error?.code).toBe('42501');
      },
    );

    it('ownerは選択カレンダーをtable単位のSELECTで読める', async () => {
      const { data, error } = await supabaseB
        .from('calendar_connection_calendars')
        .select('*')
        .eq('id', CALENDAR_CONNECTION_CALENDAR_ID);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('他ユーザーの選択カレンダーはRLSで0件になる', async () => {
      const { data, error } = await supabaseA
        .from('calendar_connection_calendars')
        .select('id')
        .eq('id', CALENDAR_CONNECTION_CALENDAR_ID);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('authenticated clientは選択カレンダーを変更できない', async () => {
      const { error } = await supabaseB
        .from('calendar_connection_calendars')
        .update({ sync_token: 'forbidden' })
        .eq('id', CALENDAR_CONNECTION_CALENDAR_ID);

      expect(error?.code).toBe('42501');
    });

    // 複合 FK (connection_id, user_id) -> calendar_connections (id, user_id) の回帰テスト。
    // service_role は RLS を bypass するので、cross-user の取り違えを止めるのは FK だけ。
    // これが無いと Step 3 の sync / Step 7 の切断が他ユーザーのミラー行を巻き込む
    it('ミラー行に他ユーザーのconnectionをぶら下げられない', async () => {
      const { error } = await adminSupabase.from('external_calendar_events').insert({
        user_id: TEST_USER_A_ID,
        connection_id: CALENDAR_CONNECTION_ID, // user B の接続
        provider: 'google',
        provider_calendar_id: 'primary',
        provider_event_id: `evt-cross-${crypto.randomUUID()}`,
        title: 'cross-user link',
        start_at: '2026-06-20T09:00:00.000Z',
        end_at: '2026-06-20T10:00:00.000Z',
        status: 'confirmed',
        last_synced_at: new Date().toISOString(),
      });

      expect(error?.code).toBe('23503');
    });

    it('切断でミラー行のconnection_idだけがNULLになりuser_idは残る', async () => {
      const connectionId = crypto.randomUUID();
      const eventId = crypto.randomUUID();

      const { error: connectionError } = await adminSupabase.from('calendar_connections').insert({
        id: connectionId,
        user_id: TEST_USER_B_ID,
        provider: 'google',
        provider_account_id: `sub-${connectionId}`,
        granted_scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        refresh_token_enc: 'disconnect-ciphertext',
        status: 'active',
      });
      expect(connectionError).toBeNull();

      const { error: eventError } = await adminSupabase.from('external_calendar_events').insert({
        id: eventId,
        user_id: TEST_USER_B_ID,
        connection_id: connectionId,
        provider: 'google',
        provider_calendar_id: 'primary',
        provider_event_id: `evt-disconnect-${eventId}`,
        title: 'survives disconnect',
        start_at: '2026-06-21T09:00:00.000Z',
        end_at: '2026-06-21T10:00:00.000Z',
        status: 'confirmed',
        last_synced_at: new Date().toISOString(),
      });
      expect(eventError).toBeNull();

      const { error: deleteError } = await adminSupabase
        .from('calendar_connections')
        .delete()
        .eq('id', connectionId);
      expect(deleteError).toBeNull();

      const { data, error } = await adminSupabase
        .from('external_calendar_events')
        .select('connection_id, user_id')
        .eq('id', eventId)
        .single();

      expect(error).toBeNull();
      expect(data?.connection_id).toBeNull();
      expect(data?.user_id).toBe(TEST_USER_B_ID);

      await adminSupabase.from('external_calendar_events').delete().eq('id', eventId);
    });

    // service_role は rolbypassrls = t なので、これは policy ではなく GRANT の証明
    it('service_roleはtoken列を読める', async () => {
      const { data, error } = await adminSupabase
        .from('calendar_connections')
        .select('refresh_token_enc, granted_scopes, provider_account_id')
        .eq('id', CALENDAR_CONNECTION_ID)
        .single();

      expect(error).toBeNull();
      expect(data?.refresh_token_enc).toBe('rls-ciphertext');
    });
  });

  describe.each(serviceRoleCases)('$table', (testCase) => {
    it.each(['select', 'insert', 'update', 'delete'] as const)(
      'authenticated clientの%sを拒否する',
      async (operation) => {
        if (operation === 'insert') {
          const { error } = await supabaseA
            .from(testCase.table)
            .insert(testCase.unauthorizedInsert());
          expect(error?.code).toBe('42501');
          return;
        }

        let query = supabaseA.from(testCase.table).select().eq(testCase.idColumn, testCase.rowId);
        if (operation === 'update') {
          query = supabaseA
            .from(testCase.table)
            .update(testCase.update)
            .eq(testCase.idColumn, testCase.rowId)
            .select();
        } else if (operation === 'delete') {
          query = supabaseA
            .from(testCase.table)
            .delete()
            .eq(testCase.idColumn, testCase.rowId)
            .select();
        }

        // #1715: serviceRoleCases の全テーブルが anon/authenticated への table grant を
        // 持たない（oauth_authorization_codes は 20260729062428、stripe_webhook_events /
        // email_suppressions は 20260810085344 で REVOKE ALL 済み）。RLS policy まで
        // 到達せず GRANT 層で 42501 になるので、"empty result, no error" の分岐は無い。
        const { error } = await query;
        expect(error?.code).toBe('42501');
      },
    );
  });

  describe('SECURITY DEFINER RPC user_id guard', () => {
    it.each([
      {
        name: 'update_personalization',
        call: () =>
          supabaseA.rpc('update_personalization', {
            p_path: 'rlsGuard',
            p_user_id: TEST_USER_B_ID,
            p_value: { blocked: true },
          }),
      },
    ])('$name は他ユーザーの p_user_id を拒否する', async ({ call }) => {
      const { error } = await call();

      expect(error?.message).toContain(ACCESS_DENIED_MESSAGE);
    });

    it('拒否された update_personalization は他ユーザー設定を変更しない', async () => {
      const { data, error } = await adminSupabase
        .from('user_settings')
        .select('personalization')
        .eq('user_id', TEST_USER_B_ID)
        .single();

      expect(error).toBeNull();
      expect(JSON.stringify(data?.personalization ?? {})).not.toContain('rlsGuard');
    });

    it('service_role は検証済みサーバー経路として personalization RPC を実行できる', async () => {
      const { error: personalizationError } = await adminSupabase.rpc('update_personalization', {
        p_path: 'rlsServiceRole',
        p_user_id: TEST_USER_B_ID,
        p_value: { allowed: true },
      });
      expect(personalizationError).toBeNull();

      const { data: settings, error: settingsError } = await adminSupabase
        .from('user_settings')
        .select('personalization')
        .eq('user_id', TEST_USER_B_ID)
        .single();

      expect(settingsError).toBeNull();
      expect(JSON.stringify(settings?.personalization ?? {})).toContain('rlsServiceRole');
    });
  });

  describe('Issue #1564 RPC permission matrix', () => {
    beforeAll(async () => {
      const confirmAnchor = Date.now();
      rpcConfirmPlanStartAt = new Date(confirmAnchor - 1_000).toISOString();
      rpcConfirmPlanEndAt = new Date(confirmAnchor + 1_500).toISOString();
      rpcConfirmRangeStartAt = new Date(confirmAnchor - 3_000).toISOString();
      rpcConfirmRangeEndAt = new Date(confirmAnchor + 3_000).toISOString();
      rpcConfirmedAt = new Date(confirmAnchor + 2_000).toISOString();

      const { error: tagError } = await adminSupabase.from('tags').insert([
        {
          id: RPC_BATCH_TAG_ID,
          user_id: TEST_USER_B_ID,
          name: 'RPC Batch',
          sort_order: 0,
        },
        {
          id: RPC_REORDER_TAG_ID,
          user_id: TEST_USER_B_ID,
          name: 'RPC Reorder',
          sort_order: 1,
        },
        {
          id: RPC_PARENT_TAG_ID,
          user_id: TEST_USER_B_ID,
          name: 'RPC Parent',
          sort_order: 2,
        },
        {
          id: RPC_GROUP_TAG_ID,
          user_id: TEST_USER_B_ID,
          name: 'RPC Old:Child',
          sort_order: 3,
        },
        {
          id: RPC_MERGE_SOURCE_TAG_ID,
          user_id: TEST_USER_B_ID,
          name: 'RPC Merge Source',
          sort_order: 4,
        },
        {
          id: RPC_MERGE_TARGET_TAG_ID,
          user_id: TEST_USER_B_ID,
          name: 'RPC Merge Target',
          sort_order: 5,
        },
        {
          id: RPC_FOREIGN_CHILD_TAG_ID,
          user_id: TEST_USER_A_ID,
          name: 'RPC Foreign Child',
          sort_order: 0,
        },
      ]);
      if (tagError) throw tagError;

      const { error: planError } = await adminSupabase.from('plans').insert([
        {
          id: RPC_SOFT_DELETE_PLAN_ID,
          user_id: TEST_USER_B_ID,
          title: 'RPC soft-delete plan',
          source: 'manual',
          start_at: RPC_SOFT_DELETE_PLAN_START_AT,
          end_at: RPC_SOFT_DELETE_PLAN_END_AT,
        },
        {
          id: RPC_CONFIRM_PLAN_ID,
          user_id: TEST_USER_B_ID,
          title: 'RPC confirm plan',
          source: 'manual',
          start_at: rpcConfirmPlanStartAt,
          end_at: rpcConfirmPlanEndAt,
        },
        {
          id: RPC_RESTORE_PLAN_ID,
          user_id: TEST_USER_B_ID,
          title: 'RPC restore plan',
          source: 'manual',
          start_at: RPC_RESTORE_PLAN_START_AT,
          end_at: RPC_RESTORE_PLAN_END_AT,
          deleted_at: rpcConfirmedAt,
        },
      ]);
      if (planError) throw planError;

      const waitForConfirmablePlanMs = new Date(rpcConfirmPlanEndAt).getTime() - Date.now() + 50;
      if (waitForConfirmablePlanMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitForConfirmablePlanMs));
      }

      const { error: recordError } = await adminSupabase.from('records').insert([
        {
          id: RPC_SOFT_DELETE_RECORD_ID,
          user_id: TEST_USER_B_ID,
          title: 'RPC soft-delete record',
          source: 'manual',
          start_at: '2026-01-13T00:00:00.000Z',
          end_at: '2026-01-13T01:00:00.000Z',
        },
        {
          id: RPC_RESTORE_RECORD_ID,
          user_id: TEST_USER_B_ID,
          title: 'RPC restore record',
          source: 'manual',
          start_at: '2026-01-14T00:00:00.000Z',
          end_at: '2026-01-14T01:00:00.000Z',
          deleted_at: '2026-01-14T02:00:00.000Z',
        },
        {
          id: RPC_AUTO_ACTIVE_RECORD_ID,
          user_id: TEST_USER_B_ID,
          title: 'RPC protected active record',
          source: 'auto_migrated',
          start_at: '2026-01-15T00:00:00.000Z',
          end_at: '2026-01-15T01:00:00.000Z',
        },
        {
          id: RPC_AUTO_DELETED_RECORD_ID,
          user_id: TEST_USER_B_ID,
          title: 'RPC protected deleted record',
          source: 'auto_migrated',
          start_at: '2026-01-16T00:00:00.000Z',
          end_at: '2026-01-16T01:00:00.000Z',
          deleted_at: '2026-01-16T02:00:00.000Z',
        },
      ]);
      if (recordError) throw recordError;

      const { error: recoveryError } = await adminSupabase.from('mfa_recovery_codes').insert([
        {
          id: RPC_COUNT_CODE_ID,
          user_id: TEST_USER_B_ID,
          code_hash: RPC_COUNT_CODE_HASH,
        },
        {
          id: RPC_USE_CODE_ID,
          user_id: TEST_USER_B_ID,
          code_hash: RPC_USE_CODE_HASH,
        },
      ]);
      if (recoveryError) throw recoveryError;
    });

    afterAll(async () => {
      await adminSupabase.from('records').delete().eq('plan_id', RPC_CONFIRM_PLAN_ID);
      await adminSupabase
        .from('records')
        .delete()
        .in('id', [
          RPC_SOFT_DELETE_RECORD_ID,
          RPC_RESTORE_RECORD_ID,
          RPC_AUTO_ACTIVE_RECORD_ID,
          RPC_AUTO_DELETED_RECORD_ID,
        ]);
      await adminSupabase
        .from('plans')
        .delete()
        .in('id', [RPC_SOFT_DELETE_PLAN_ID, RPC_CONFIRM_PLAN_ID, RPC_RESTORE_PLAN_ID]);
      await adminSupabase
        .from('mfa_recovery_codes')
        .delete()
        .in('id', [RPC_COUNT_CODE_ID, RPC_USE_CODE_ID]);
      await adminSupabase
        .from('tags')
        .delete()
        .in('id', [
          RPC_BATCH_TAG_ID,
          RPC_REORDER_TAG_ID,
          RPC_PARENT_TAG_ID,
          RPC_GROUP_TAG_ID,
          RPC_MERGE_SOURCE_TAG_ID,
          RPC_MERGE_TARGET_TAG_ID,
          RPC_FOREIGN_CHILD_TAG_ID,
        ]);
    });

    it('5つの継続invoker RPCはcross-userのp_user_idを拒否し対象を変更しない', async () => {
      const calls = [
        () =>
          supabaseA.rpc('batch_rename_tags', {
            p_new_names: ['RPC Cross-user Rename'],
            p_tag_ids: [RPC_BATCH_TAG_ID],
            p_user_id: TEST_USER_B_ID,
          }),
        () =>
          supabaseA.rpc('batch_reorder_tags_hierarchy', {
            p_parent_ids: [RPC_PARENT_TAG_ID],
            p_sort_orders: [99],
            p_tag_ids: [RPC_REORDER_TAG_ID],
            p_user_id: TEST_USER_B_ID,
          }),
        () =>
          supabaseA.rpc('rename_tag_group', {
            p_new_prefix: 'RPC Cross-user',
            p_old_prefix: 'RPC Old',
            p_user_id: TEST_USER_B_ID,
          }),
        () => supabaseA.rpc('count_unused_recovery_codes', { p_user_id: TEST_USER_B_ID }),
        () =>
          supabaseA.rpc('update_personalization', {
            p_path: 'rpcCrossUser',
            p_user_id: TEST_USER_B_ID,
            p_value: { blocked: true },
          }),
      ];

      for (const call of calls) {
        const { error } = await call();
        expect(error?.message).toContain(ACCESS_DENIED_MESSAGE);
      }

      const [{ data: tags }, { data: settings }] = await Promise.all([
        adminSupabase
          .from('tags')
          .select('id, name, parent_id, sort_order')
          .in('id', [RPC_BATCH_TAG_ID, RPC_REORDER_TAG_ID, RPC_GROUP_TAG_ID]),
        adminSupabase
          .from('user_settings')
          .select('personalization')
          .eq('user_id', TEST_USER_B_ID)
          .single(),
      ]);

      expect(tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: RPC_BATCH_TAG_ID, name: 'RPC Batch' }),
          expect.objectContaining({ id: RPC_REORDER_TAG_ID, parent_id: null, sort_order: 1 }),
          expect.objectContaining({ id: RPC_GROUP_TAG_ID, name: 'RPC Old:Child' }),
        ]),
      );
      expect(JSON.stringify(settings?.personalization ?? {})).not.toContain('rpcCrossUser');
    });

    it('5つの継続invoker RPCはowner経路で成功する', async () => {
      const { data: renamed, error: renameError } = await supabaseB.rpc('batch_rename_tags', {
        p_new_names: ['RPC Batch Renamed'],
        p_tag_ids: [RPC_BATCH_TAG_ID],
        p_user_id: TEST_USER_B_ID,
      });
      expect(renameError).toBeNull();
      expect(renamed).toBe(1);

      const { data: reordered, error: reorderError } = await supabaseB.rpc(
        'batch_reorder_tags_hierarchy',
        {
          p_parent_ids: [RPC_PARENT_TAG_ID],
          p_sort_orders: [9],
          p_tag_ids: [RPC_REORDER_TAG_ID],
          p_user_id: TEST_USER_B_ID,
        },
      );
      expect(reorderError).toBeNull();
      expect(reordered).toBe(1);

      const { error: groupError } = await supabaseB.rpc('rename_tag_group', {
        p_new_prefix: 'RPC New',
        p_old_prefix: 'RPC Old',
        p_user_id: TEST_USER_B_ID,
      });
      expect(groupError).toBeNull();

      const { data: count, error: countError } = await supabaseB.rpc(
        'count_unused_recovery_codes',
        { p_user_id: TEST_USER_B_ID },
      );
      expect(countError).toBeNull();
      expect(count).toBeGreaterThanOrEqual(2);

      const { error: personalizationError } = await supabaseB.rpc('update_personalization', {
        p_path: 'rpcOwner',
        p_user_id: TEST_USER_B_ID,
        p_value: { allowed: true },
      });
      expect(personalizationError).toBeNull();
    });

    // Candidate 6 は plans / records の直接 DML だけを剥がし、旧 bundle が呼ぶ 3 RPC の
    // authenticated EXECUTE は残す。EXECUTE を落とすのは旧 instance の drain 後。
    // 実行できた上で owner 照合が働くことを、message で区別して固定する。
    it('旧bundle向け3 RPCはcross-user実行をowner照合で拒否し対象を変更しない', async () => {
      const calls = [
        () =>
          supabaseA.rpc('confirm_day_plans_to_records', {
            p_confirmed_at: rpcConfirmedAt,
            p_end_at: rpcConfirmRangeEndAt,
            p_start_at: rpcConfirmRangeStartAt,
            p_user_id: TEST_USER_B_ID,
          }),
        () =>
          supabaseA.rpc('soft_delete_plan', {
            p_plan_id: RPC_SOFT_DELETE_PLAN_ID,
            p_user_id: TEST_USER_B_ID,
          }),
        () =>
          supabaseA.rpc('soft_delete_record', {
            p_record_id: RPC_SOFT_DELETE_RECORD_ID,
            p_user_id: TEST_USER_B_ID,
          }),
      ];

      for (const call of calls) {
        const { error } = await call();
        // EXECUTE 権限不足 (42501 permission denied for function) ではなく、
        // 関数内の auth.uid() 照合で落ちていることを message で証明する
        expect(error?.message).toContain(ACCESS_DENIED_MESSAGE);
      }

      const [{ data: plan }, { data: record }, { data: confirmed }] = await Promise.all([
        adminSupabase.from('plans').select('deleted_at').eq('id', RPC_SOFT_DELETE_PLAN_ID).single(),
        adminSupabase
          .from('records')
          .select('deleted_at')
          .eq('id', RPC_SOFT_DELETE_RECORD_ID)
          .single(),
        adminSupabase.from('records').select('id').eq('plan_id', RPC_CONFIRM_PLAN_ID),
      ]);
      expect(plan?.deleted_at).toBeNull();
      expect(record?.deleted_at).toBeNull();
      expect(confirmed).toEqual([]);
    });

    it('旧bundle向け3 RPCはauthenticated owner互換をdrainまで維持する', async () => {
      const { data: confirmed, error: confirmError } = await supabaseB.rpc(
        'confirm_day_plans_to_records',
        {
          p_confirmed_at: rpcConfirmedAt,
          p_end_at: rpcConfirmRangeEndAt,
          p_start_at: rpcConfirmRangeStartAt,
          p_user_id: TEST_USER_B_ID,
        },
      );
      expect(confirmError).toBeNull();
      expect(confirmed).toHaveLength(1);
      expect(confirmed?.[0]).not.toHaveProperty('fulfillment_score');

      const { error: planError } = await supabaseB.rpc('soft_delete_plan', {
        p_plan_id: RPC_SOFT_DELETE_PLAN_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(planError).toBeNull();

      const { error: recordError } = await supabaseB.rpc('soft_delete_record', {
        p_record_id: RPC_SOFT_DELETE_RECORD_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(recordError).toBeNull();

      // SELECT は残っているので、RPC の効果を browser client から確認できる
      const [{ data: deletedPlans }, { data: deletedRecords }] = await Promise.all([
        supabaseB.from('plans').select('id').eq('id', RPC_SOFT_DELETE_PLAN_ID),
        supabaseB.from('records').select('id').eq('id', RPC_SOFT_DELETE_RECORD_ID),
      ]);
      expect(deletedPlans).toEqual([]);
      expect(deletedRecords).toEqual([]);
    });

    it('4つのprivileged RPCはauthenticated直接実行を42501で拒否する', async () => {
      const calls = [
        () =>
          supabaseB.rpc('merge_tags_with_hierarchy', {
            p_source_tag_id: RPC_MERGE_SOURCE_TAG_ID,
            p_target_tag_id: RPC_MERGE_TARGET_TAG_ID,
            p_user_id: TEST_USER_B_ID,
          }),
        () =>
          supabaseB.rpc('restore_plan', {
            p_plan_id: RPC_RESTORE_PLAN_ID,
            p_user_id: TEST_USER_B_ID,
          }),
        () =>
          supabaseB.rpc('restore_record', {
            p_record_id: RPC_RESTORE_RECORD_ID,
            p_user_id: TEST_USER_B_ID,
          }),
        () =>
          supabaseB.rpc('use_recovery_code', {
            p_code_hash: RPC_USE_CODE_HASH,
            p_user_id: TEST_USER_B_ID,
          }),
      ];

      for (const call of calls) {
        const { error } = await call();
        expect(error?.code).toBe('42501');
      }
    });

    it('4つのprivileged RPCはservice-role経路で成功する', async () => {
      const { error: mergeError } = await adminSupabase.rpc('merge_tags_with_hierarchy', {
        p_source_tag_id: RPC_MERGE_SOURCE_TAG_ID,
        p_target_tag_id: RPC_MERGE_TARGET_TAG_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(mergeError).toBeNull();

      const { error: planError } = await adminSupabase.rpc('restore_plan', {
        p_plan_id: RPC_RESTORE_PLAN_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(planError).toBeNull();

      const { error: recordError } = await adminSupabase.rpc('restore_record', {
        p_record_id: RPC_RESTORE_RECORD_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(recordError).toBeNull();

      const { data: used, error: recoveryError } = await adminSupabase.rpc('use_recovery_code', {
        p_code_hash: RPC_USE_CODE_HASH,
        p_user_id: TEST_USER_B_ID,
      });
      expect(recoveryError).toBeNull();
      expect(used).toBe(true);
    });

    it('auto_migrated Recordはcaller roleに関係なくdelete/restoreできない', async () => {
      const { error: userDeleteError } = await supabaseB.rpc('soft_delete_record', {
        p_record_id: RPC_AUTO_ACTIVE_RECORD_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(userDeleteError).not.toBeNull();

      const { error: serviceDeleteError } = await adminSupabase.rpc('soft_delete_record', {
        p_record_id: RPC_AUTO_ACTIVE_RECORD_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(serviceDeleteError).not.toBeNull();

      const { error: serviceRestoreError } = await adminSupabase.rpc('restore_record', {
        p_record_id: RPC_AUTO_DELETED_RECORD_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(serviceRestoreError).not.toBeNull();

      const [{ data: active }, { data: deleted }] = await Promise.all([
        adminSupabase
          .from('records')
          .select('deleted_at')
          .eq('id', RPC_AUTO_ACTIVE_RECORD_ID)
          .single(),
        adminSupabase
          .from('records')
          .select('deleted_at')
          .eq('id', RPC_AUTO_DELETED_RECORD_ID)
          .single(),
      ]);
      expect(active?.deleted_at).toBeNull();
      expect(deleted?.deleted_at).not.toBeNull();
    });

    it('foreign parentをRPCと直接INSERT/UPDATEの全経路で拒否する', async () => {
      const insertedTagId = crypto.randomUUID();
      const { error: insertError } = await supabaseA.from('tags').insert({
        id: insertedTagId,
        user_id: TEST_USER_A_ID,
        name: 'RPC Foreign Insert',
        parent_id: RPC_PARENT_TAG_ID,
      });
      expect(insertError?.code).toBe('23514');

      const { error: updateError } = await supabaseA
        .from('tags')
        .update({ parent_id: RPC_PARENT_TAG_ID })
        .eq('id', RPC_FOREIGN_CHILD_TAG_ID);
      expect(updateError?.code).toBe('23514');

      const { error: rpcError } = await supabaseA.rpc('batch_reorder_tags_hierarchy', {
        p_parent_ids: [RPC_PARENT_TAG_ID],
        p_sort_orders: [1],
        p_tag_ids: [RPC_FOREIGN_CHILD_TAG_ID],
        p_user_id: TEST_USER_A_ID,
      });
      expect(rpcError?.code).toBe('23514');

      const { data: child } = await adminSupabase
        .from('tags')
        .select('parent_id')
        .eq('id', RPC_FOREIGN_CHILD_TAG_ID)
        .single();
      expect(child?.parent_id).toBeNull();
    });

    it('Production-only merge_tags overloadは存在しない', async () => {
      const { error } = await adminSupabase.rpc(
        'merge_tags' as never,
        {
          p_source_tag_ids: [RPC_MERGE_SOURCE_TAG_ID],
          p_target_tag_id: RPC_MERGE_TARGET_TAG_ID,
          p_user_id: TEST_USER_B_ID,
        } as never,
      );

      expect(error?.code).toBe('PGRST202');
    });
  });

  it('I-16 snapshotがsuiteの全対象テーブルを含む', () => {
    const snapshot = readFileSync(
      resolve(process.cwd(), '../../docs/engineering/data/db/rls-snapshot.md'),
      'utf8',
    );

    for (const { table } of [...userOwnedCases, ...serviceRoleCases]) {
      expect(snapshot).toContain(`### ${table}`);
    }
    expect(
      snapshot.match(
        /\| No browser client access \| ALL \| PERMISSIVE \| \{anon,authenticated\} \| false \| false\s+\|/g,
      ),
    ).toHaveLength(serviceRoleCases.length);
    expect(snapshot).not.toContain('### user_badges');
    expect(snapshot).not.toContain('### api_keys');
  });

  it('I-16 snapshotがPlan / Recordのwrite境界を記録する', () => {
    const snapshot = readFileSync(
      resolve(process.cwd(), '../../docs/engineering/data/db/rls-snapshot.md'),
      'utf8',
    );

    expect(snapshot).toContain('## Plan / Record effective write境界');
    expect(snapshot).toContain(
      '✅ `anon` / `authenticated`のeffective table / column write権限なし',
    );

    // table 権限は SELECT だけ。TRUNCATE / MAINTAIN を含む privilege も snapshot に
    // 出るようフィルタを外してあるので、混入すればこの行が変わる
    for (const table of ['plans', 'records']) {
      expect(snapshot).toMatch(
        new RegExp(`\\| table\\s+\\| public\\.${table}\\s+\\| authenticated\\s+\\| SELECT\\s+\\|`),
      );
    }
    expect(snapshot).not.toMatch(/\| (table|column)\s+\| public\.plans\S*\s+\| anon\s+\|/);
    expect(snapshot).not.toMatch(/\| (table|column)\s+\| public\.records\S*\s+\| anon\s+\|/);
  });

  it('I-16 snapshotがcalendar_connectionsのcolumn grantを列単位で記録する', () => {
    const snapshot = readFileSync(
      resolve(process.cwd(), '../../docs/engineering/data/db/rls-snapshot.md'),
      'utf8',
    );

    expect(snapshot).toContain('### calendar_connections');
    expect(snapshot).toContain('### calendar_connection_calendars');

    for (const column of CALENDAR_CONNECTION_GRANTED_COLUMNS) {
      expect(snapshot).toContain(`public.calendar_connections.${column}`);
    }
    for (const column of CALENDAR_CONNECTION_WITHHELD_COLUMNS) {
      expect(snapshot).not.toContain(`public.calendar_connections.${column}`);
    }

    // table 単位の SELECT を authenticated に与えていないことの記録。
    // 与えてしまうと列単位の grant が意味を失う
    expect(snapshot).not.toMatch(
      /\| table\s+\| public\.calendar_connections\s+\| authenticated\s+\|/,
    );
  });
});
