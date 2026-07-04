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
const TEST_USER_B_ENTRY_ID = crypto.randomUUID();
const TEST_EMAIL_A = `test-rls-a-${TEST_USER_A_ID}@example.com`;
const TEST_EMAIL_B = `test-rls-b-${TEST_USER_B_ID}@example.com`;
const TEST_PASSWORD = 'test-password-123';
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';
const ACCESS_DENIED_MESSAGE = 'Access denied: user_id mismatch';

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
    table: 'entries',
    idColumn: 'id',
    rowId: TEST_USER_B_ENTRY_ID,
    seed: async function () {
      const { error } = await adminSupabase.from('entries').insert({
        id: this.rowId,
        user_id: TEST_USER_B_ID,
        title: 'RLS entry',
        origin: 'planned',
        start_time: '2026-06-15T09:00:00.000Z',
        end_time: '2026-06-15T10:00:00.000Z',
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
      scopes: ['read'],
    },
    unauthorizedInsert: () => ({
      code_hash: `rls-${crypto.randomUUID()}`,
      user_id: TEST_USER_A_ID,
      client_id: 'unknown',
      redirect_uri: 'https://example.com/oauth/callback',
      code_challenge: 'rls-code-challenge',
      code_challenge_method: 'S256',
      scopes: ['read'],
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

        const { data, error } = await query;
        expect(error).toBeNull();
        expect(data).toEqual([]);
      },
    );
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

        const { data, error } = await query;
        expect(error).toBeNull();
        expect(data).toEqual([]);
      },
    );
  });

  describe('SECURITY DEFINER RPC user_id guard', () => {
    it.each([
      {
        name: 'soft_delete_entry',
        call: () =>
          supabaseA.rpc('soft_delete_entry', {
            p_entry_id: TEST_USER_B_ENTRY_ID,
            p_user_id: TEST_USER_B_ID,
          }),
      },
      {
        name: 'restore_entry',
        call: () =>
          supabaseA.rpc('restore_entry', {
            p_entry_id: TEST_USER_B_ENTRY_ID,
            p_user_id: TEST_USER_B_ID,
          }),
      },
      {
        name: 'bulk_soft_delete_entries',
        call: () =>
          supabaseA.rpc('bulk_soft_delete_entries', {
            p_entry_ids: [TEST_USER_B_ENTRY_ID],
            p_user_id: TEST_USER_B_ID,
          }),
      },
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

    it('拒否された soft-delete RPC は他ユーザー entry を変更しない', async () => {
      const { data, error } = await adminSupabase
        .from('entries')
        .select('deleted_at')
        .eq('id', TEST_USER_B_ENTRY_ID)
        .single();

      expect(error).toBeNull();
      expect(data?.deleted_at).toBeNull();
    });

    it('service_role は検証済みサーバー経路として soft-delete / restore RPC を実行できる', async () => {
      const { error: deleteError } = await adminSupabase.rpc('soft_delete_entry', {
        p_entry_id: TEST_USER_B_ENTRY_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(deleteError).toBeNull();

      const { data: deletedEntry, error: deletedReadError } = await adminSupabase
        .from('entries')
        .select('deleted_at')
        .eq('id', TEST_USER_B_ENTRY_ID)
        .single();
      expect(deletedReadError).toBeNull();
      expect(deletedEntry?.deleted_at).not.toBeNull();

      const { error: restoreError } = await adminSupabase.rpc('restore_entry', {
        p_entry_id: TEST_USER_B_ENTRY_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(restoreError).toBeNull();

      const { data: restoredEntry, error: restoredReadError } = await adminSupabase
        .from('entries')
        .select('deleted_at')
        .eq('id', TEST_USER_B_ENTRY_ID)
        .single();
      expect(restoredReadError).toBeNull();
      expect(restoredEntry?.deleted_at).toBeNull();
    });

    it('service_role は検証済みサーバー経路として bulk delete / personalization RPC を実行できる', async () => {
      const { data: affected, error: bulkDeleteError } = await adminSupabase.rpc(
        'bulk_soft_delete_entries',
        {
          p_entry_ids: [TEST_USER_B_ENTRY_ID],
          p_user_id: TEST_USER_B_ID,
        },
      );
      expect(bulkDeleteError).toBeNull();
      expect(affected).toBe(1);

      const { error: restoreError } = await adminSupabase.rpc('restore_entry', {
        p_entry_id: TEST_USER_B_ENTRY_ID,
        p_user_id: TEST_USER_B_ID,
      });
      expect(restoreError).toBeNull();

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
});
