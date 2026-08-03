import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { plansRouter } from '@/features/timeblock/server/plans-router';
import { recordsRouter } from '@/features/timeblock/server/records-router';
import type { Database } from '@/lib/database';
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
  resolveRequestedResource,
} from '@/lib/oauth-server';
import { generateAuthorizationCode, hashToken } from '@/lib/oauth-server/tokens';
import { createTestCaller } from '@/lib/test/trpc-test-helpers';
import type { Context } from '@/lib/trpc/procedures';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const userClient = createClient<Database>(LOCAL_DB_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = crypto.randomUUID();
const email = `mcp-stage1-compat-${userId}@example.com`;
const password = 'test-password-123';
type PlanRow = Database['public']['Tables']['plans']['Row'];

const oauthExpandMigration = readFileSync(
  new URL(
    '../../../../../../supabase/migrations/20260729062428_mcp_oauth_connections_expand.sql',
    import.meta.url,
  ),
  'utf8',
);
const oauthRotationMigration = readFileSync(
  new URL(
    '../../../../../../supabase/migrations/20260729062430_oauth_refresh_rotation_hardening.sql',
    import.meta.url,
  ),
  'utf8',
);
const oauthCutoverMigration = readFileSync(
  new URL(
    '../../../../../../supabase/migrations/20260729062433_oauth_connection_cutover_hardening.sql',
    import.meta.url,
  ),
  'utf8',
);
const timeblockExpandMigration = readFileSync(
  new URL(
    '../../../../../../supabase/migrations/20260729062435_timeblock_atomic_commands.sql',
    import.meta.url,
  ),
  'utf8',
);
const mutationFoundationMigration = readFileSync(
  new URL(
    '../../../../../../supabase/migrations/20260729062445_mcp_mutation_envelope_foundation.sql',
    import.meta.url,
  ),
  'utf8',
);
const revisionFenceMigration = readFileSync(
  new URL(
    '../../../../../../supabase/migrations/20260729073124_mcp_stage1_revision_fence.sql',
    import.meta.url,
  ),
  'utf8',
);

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60_000).toISOString();
}

function runOwnerSql(sql: string, variables: Record<string, string>): void {
  const result = spawnSync(
    'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`]),
      '-h',
      '127.0.0.1',
      '-p',
      '54322',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    {
      env: { ...process.env, PGPASSWORD: 'postgres' },
      encoding: 'utf8',
      input: sql,
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Owner SQL failed');
  }
}

async function createHistoricalPlan(input: {
  title: string;
  startAt: string;
  endAt: string;
}): Promise<PlanRow> {
  const planId = crypto.randomUUID();
  runOwnerSql(
    `
      INSERT INTO public.plans (
        id, user_id, title, source, start_at, end_at
      ) VALUES (
        :'plan_id'::UUID,
        :'user_id'::UUID,
        :'title',
        'manual',
        :'start_at'::TIMESTAMPTZ,
        :'end_at'::TIMESTAMPTZ
      );
    `,
    {
      plan_id: planId,
      user_id: userId,
      title: input.title,
      start_at: input.startAt,
      end_at: input.endAt,
    },
  );

  const { data, error } = await admin.from('plans').select().eq('id', planId).single();
  if (error) throw error;
  return data;
}

/**
 * legacy tRPC route と同じ context を作る。
 *
 * `ctx.supabase` は authenticated client のまま（read と旧 3 RPC はここを通る）で、
 * write だけが service-owned command boundary へ降りることを確認するための土台。
 */
function legacyContext(): Context {
  return {
    req: {
      headers: {},
      cookies: {},
      socket: { remoteAddress: '127.0.0.1' },
    } as Context['req'],
    res: {
      setHeader: () => {},
      end: () => {},
    } as unknown as Context['res'],
    userId,
    sessionId: 'mcp-stage1-compat-session',
    mfaAssurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
    supabase: userClient,
    authMode: 'session' as const,
  };
}

describe.skipIf(!RUN_LOCAL)('MCP Stage 1 rolling compatibility', () => {
  it('keeps rollout preflights behind bounded write-blocking locks', () => {
    for (const migration of [oauthExpandMigration, timeblockExpandMigration]) {
      const beginIndex = migration.indexOf('BEGIN;');
      const lockTimeoutIndex = migration.indexOf("SET LOCAL lock_timeout = '5s';");
      const statementTimeoutIndex = migration.indexOf("SET LOCAL statement_timeout = '30s';");
      const lockIndex = migration.indexOf('IN SHARE ROW EXCLUSIVE MODE;');
      const preflightIndex = migration.indexOf('DO $$', lockIndex);
      const commitIndex = migration.lastIndexOf('COMMIT;');

      expect(beginIndex).toBeGreaterThanOrEqual(0);
      expect(lockTimeoutIndex).toBeGreaterThan(beginIndex);
      expect(statementTimeoutIndex).toBeGreaterThan(lockTimeoutIndex);
      expect(lockIndex).toBeGreaterThan(statementTimeoutIndex);
      expect(preflightIndex).toBeGreaterThan(lockIndex);
      expect(commitIndex).toBeGreaterThan(preflightIndex);
    }
  });

  it('bounds every OAuth and mutation DDL transaction', () => {
    for (const migration of [
      oauthRotationMigration,
      oauthCutoverMigration,
      mutationFoundationMigration,
    ]) {
      expect(migration).toContain('BEGIN;');
      expect(migration).toContain("SET LOCAL lock_timeout = '5s';");
      expect(migration).toContain("SET LOCAL statement_timeout = '60s';");
      expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    }
  });

  it('binds the old code exchange to one connection in every visible OAuth migration', () => {
    for (const migration of [oauthExpandMigration, oauthCutoverMigration]) {
      expect(migration).toContain("ELSIF NEW.token_type = 'refresh' THEN");
      expect(migration).toContain('code.consumed_at IS NOT NULL');
      expect(migration).toContain('family_token.connection_id = connection.id');
      expect(migration).toContain("RAISE EXCEPTION 'Legacy OAuth code binding is ambiguous'");
    }
  });

  it('never installs a database-global direct writer boundary', () => {
    expect(revisionFenceMigration).not.toContain('dayopt:timeblock-global-direct-write');
    expect(revisionFenceMigration).not.toContain('lock_timeblock_global_supported_write_v1');
    expect(revisionFenceMigration).not.toContain(
      'trigger_lock_timeblock_global_before_account_delete',
    );
  });

  it('initializes revision markers for existing and future auth users', () => {
    const authUserLockIndex = revisionFenceMigration.indexOf(
      'LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;',
    );
    const backfillIndex = revisionFenceMigration.indexOf(
      'INSERT INTO private.timeblock_user_revisions (user_id)',
    );
    const initializeTriggerIndex = revisionFenceMigration.indexOf(
      'CREATE TRIGGER trigger_initialize_timeblock_user_revision',
    );

    expect(authUserLockIndex).toBeGreaterThanOrEqual(0);
    expect(backfillIndex).toBeGreaterThan(authUserLockIndex);
    expect(initializeTriggerIndex).toBeGreaterThan(backfillIndex);
    expect(revisionFenceMigration).toContain(
      'INSERT INTO private.timeblock_user_revisions (user_id)',
    );
    expect(revisionFenceMigration).toContain('SELECT app_user.id');
    expect(revisionFenceMigration).toContain(
      'CREATE TRIGGER trigger_initialize_timeblock_user_revision',
    );
    expect(revisionFenceMigration).toContain(
      'CREATE TRIGGER trigger_cleanup_timeblock_user_revision',
    );
    expect(revisionFenceMigration).not.toContain(
      'user_id UUID PRIMARY KEY REFERENCES auth.users(id)',
    );
  });

  beforeAll(async () => {
    const { error } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;

    const { error: signInError } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    await userClient.auth.signOut();
    await admin.auth.admin.deleteUser(userId);
  });

  it('keeps the exact old code exchange in one read-only connection family', async () => {
    const codeHash = `code-${crypto.randomUUID()}`;
    const { data: code, error: codeError } = await admin
      .from('oauth_authorization_codes')
      .insert({
        user_id: userId,
        client_id: 'chatgpt',
        code_hash: codeHash,
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        scopes: ['read:entries'],
      })
      .select('code_hash, connection_id')
      .single();

    expect(codeError).toBeNull();
    expect(code?.connection_id).toEqual(expect.any(String));

    const { error: consumeError } = await admin
      .from('oauth_authorization_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('code_hash', codeHash);
    expect(consumeError).toBeNull();

    const { data: refresh, error: refreshError } = await admin
      .from('oauth_tokens')
      .insert({
        user_id: userId,
        client_id: 'chatgpt',
        token_hash: `refresh-${crypto.randomUUID()}`,
        token_type: 'refresh',
        scopes: ['read:entries'],
        expires_at: hoursAgo(-1),
      })
      .select('id, connection_id')
      .single();

    expect(refreshError).toBeNull();
    expect(refresh?.connection_id).toBe(code?.connection_id);

    const { data: access, error: accessError } = await admin
      .from('oauth_tokens')
      .insert({
        user_id: userId,
        client_id: 'chatgpt',
        token_hash: `access-${crypto.randomUUID()}`,
        token_type: 'access',
        scopes: ['read:entries'],
        expires_at: hoursAgo(-1),
        parent_token_id: refresh!.id,
      })
      .select('id, connection_id')
      .single();

    expect(accessError).toBeNull();
    expect(access?.connection_id).toBe(code?.connection_id);

    const { data: connection, error: connectionError } = await admin
      .from('oauth_connections')
      .select('legacy_read_only, resource_uri, scopes')
      .eq('id', code!.connection_id)
      .single();

    expect(connectionError).toBeNull();
    expect(connection).toMatchObject({
      legacy_read_only: true,
      resource_uri: 'https://mcp.dayopt.app',
      scopes: ['read:entries'],
    });

    const { error: unbindCodeError } = await admin
      .from('oauth_authorization_codes')
      .update({ connection_id: null })
      .eq('code_hash', code!.code_hash);
    expect(unbindCodeError?.code).toBe('23514');

    const { error: unbindTokenError } = await admin
      .from('oauth_tokens')
      .update({ connection_id: null })
      .eq('id', access!.id);
    expect(unbindTokenError?.code).toBe('23514');

    const { error: browserBridgeError } = await userClient
      .from('oauth_authorization_codes')
      .insert({
        user_id: userId,
        client_id: 'chatgpt',
        code_hash: `browser-code-${crypto.randomUUID()}`,
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        scopes: ['read:entries'],
      });
    expect(browserBridgeError?.code).toBe('42501');

    const { error: writeGrantError } = await admin.from('oauth_tokens').insert({
      user_id: userId,
      client_id: 'chatgpt',
      token_hash: `write-token-${crypto.randomUUID()}`,
      token_type: 'access',
      scopes: ['read:entries', 'write:plans'],
      expires_at: hoursAgo(-1),
    });

    expect(writeGrantError?.code).toBe('42501');
  });

  it('keeps the current runtime exchange and refresh in one connection family', async () => {
    const verifier = `runtime-verifier-${crypto.randomUUID()}`;
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorizationCode = generateAuthorizationCode();
    const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
    // Candidate 7 以降、exchange / rotation は resource indicator (RFC 8707) を
    // 同一 transaction 内で照合する。grant 側の resource_uri も同じ origin に揃える。
    const resourceUri = resolveRequestedResource('https://mcp.dayopt.app');
    if (!resourceUri) throw new Error('Local MCP resource identity is unavailable');
    const { data: insertedCode, error: codeError } = await admin
      .from('oauth_authorization_codes')
      .insert({
        user_id: userId,
        client_id: 'chatgpt',
        code_hash: authorizationCode.hash,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        resource_uri: resourceUri,
        scopes: ['read:entries'],
      })
      .select('connection_id')
      .single();
    if (codeError) throw codeError;

    const firstPair = await exchangeAuthorizationCode({
      code: authorizationCode.code,
      client_id: 'chatgpt',
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource_uri: resourceUri,
    });
    const { data: firstRefresh, error: firstRefreshError } = await admin
      .from('oauth_tokens')
      .select('connection_id')
      .eq('token_hash', hashToken(firstPair.refresh_token))
      .single();
    if (firstRefreshError) throw firstRefreshError;

    const rotatedPair = await refreshAccessToken({
      refresh_token: firstPair.refresh_token,
      client_id: 'chatgpt',
      resource_uri: resourceUri,
    });
    const { data: rotatedRefresh, error: rotatedRefreshError } = await admin
      .from('oauth_tokens')
      .select('connection_id')
      .eq('token_hash', hashToken(rotatedPair.refresh_token))
      .single();
    if (rotatedRefreshError) throw rotatedRefreshError;

    expect(firstRefresh?.connection_id).toBe(insertedCode?.connection_id);
    expect(rotatedRefresh?.connection_id).toBe(insertedCode?.connection_id);
  });

  // Candidate 6: authenticated から plans / records の直接 DML を剥がした。旧 bundle の
  // 直接 DML はここで止まり、旧 3 RPC だけが drain まで動く。
  it('rejects every authenticated direct Plan and Record DML', async () => {
    const existingPlan = await createHistoricalPlan({
      title: 'Direct DML target Plan',
      startAt: hoursAgo(20),
      endAt: hoursAgo(19),
    });
    const { data: existingRecord, error: seedRecordError } = await admin
      .from('records')
      .insert({
        user_id: userId,
        title: 'Direct DML target Record',
        source: 'manual',
        start_at: hoursAgo(18),
        end_at: hoursAgo(17),
      })
      .select('id, title')
      .single();
    if (seedRecordError) throw seedRecordError;

    const [planInsert, recordInsert, planUpdate, recordUpdate, planDelete, recordDelete] =
      await Promise.all([
        userClient.from('plans').insert({
          user_id: userId,
          title: 'Forbidden direct Plan',
          source: 'manual',
          start_at: hoursAgo(-1),
          end_at: hoursAgo(-2),
        }),
        userClient.from('records').insert({
          user_id: userId,
          title: 'Forbidden direct Record',
          source: 'manual',
          start_at: hoursAgo(16),
          end_at: hoursAgo(15),
        }),
        userClient
          .from('plans')
          .update({ title: 'Forbidden direct Plan update' })
          .eq('id', existingPlan.id),
        userClient
          .from('records')
          .update({ title: 'Forbidden direct Record update' })
          .eq('id', existingRecord.id),
        userClient.from('plans').delete().eq('id', existingPlan.id),
        userClient.from('records').delete().eq('id', existingRecord.id),
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

    // SELECT は残しているので旧 bundle の read は壊れない
    const [{ data: plan, error: planReadError }, { data: record, error: recordReadError }] =
      await Promise.all([
        userClient.from('plans').select('title').eq('id', existingPlan.id).single(),
        userClient.from('records').select('title').eq('id', existingRecord.id).single(),
      ]);
    expect(planReadError).toBeNull();
    expect(recordReadError).toBeNull();
    expect(plan?.title).toBe('Direct DML target Plan');
    expect(record?.title).toBe('Direct DML target Record');

    // 旧 bundle が残す 3 RPC は drain まで authenticated から動く
    const { error: legacyDeletePlanError } = await userClient.rpc('soft_delete_plan', {
      p_plan_id: existingPlan.id,
      p_user_id: userId,
    });
    expect(legacyDeletePlanError).toBeNull();

    const { error: legacyDeleteRecordError } = await userClient.rpc('soft_delete_record', {
      p_record_id: existingRecord.id,
      p_user_id: userId,
    });
    expect(legacyDeleteRecordError).toBeNull();
  });

  it('keeps every current Plan and Record write path available', async () => {
    const ctx = legacyContext();
    const plans = createTestCaller(plansRouter, ctx);
    const records = createTestCaller(recordsRouter, ctx);

    const plan = await plans.create({
      title: 'Legacy Plan',
      start_at: hoursAgo(-1),
      end_at: hoursAgo(-2),
    });
    expect(plan.user_id).toBe(userId);

    const updatedPlan = await plans.update({
      id: plan.id,
      data: { title: 'Legacy Plan updated' },
    });
    expect(updatedPlan.title).toBe('Legacy Plan updated');

    const historicalPlan = await createHistoricalPlan({
      title: 'Existing past Plan',
      startAt: hoursAgo(8),
      endAt: hoursAgo(7),
    });

    const skippedPlan = await plans.skip({ id: historicalPlan.id });
    expect(skippedPlan.skipped_at).not.toBeNull();

    const unskippedPlan = await plans.unskip({ id: historicalPlan.id });
    expect(unskippedPlan.skipped_at).toBeNull();

    await expect(plans.delete({ id: plan.id })).resolves.toEqual({ success: true });
    await expect(plans.restore({ id: plan.id })).resolves.toEqual({ success: true });

    const record = await records.create({
      title: 'Legacy Record',
      start_at: hoursAgo(6),
      end_at: hoursAgo(5),
    });
    expect(record.source).toBe('manual');

    const updatedRecord = await records.update({
      id: record.id,
      data: { title: 'Legacy Record updated' },
    });
    expect(updatedRecord.title).toBe('Legacy Record updated');

    await expect(records.delete({ id: record.id })).resolves.toEqual({ success: true });
    await expect(records.restore({ id: record.id })).resolves.toEqual({ success: true });

    const recordablePlan = await createHistoricalPlan({
      title: 'Legacy recordable Plan',
      startAt: hoursAgo(4),
      endAt: hoursAgo(3),
    });

    const linkedRecord = await records.create({
      title: recordablePlan.title,
      planId: recordablePlan.id,
      start_at: recordablePlan.start_at,
      end_at: recordablePlan.end_at,
    });
    expect(linkedRecord.plan_id).toBe(recordablePlan.id);

    await expect(plans.delete({ id: recordablePlan.id })).resolves.toEqual({ success: true });

    const activeLinkedRecord = await records.getById({ id: linkedRecord.id });
    expect(activeLinkedRecord.deleted_at).toBeNull();
    expect(activeLinkedRecord.plan_id).toBe(recordablePlan.id);

    await expect(records.delete({ id: linkedRecord.id })).resolves.toEqual({ success: true });
    await expect(records.restore({ id: linkedRecord.id })).resolves.toEqual({ success: true });

    const restoredLinkedRecord = await records.getById({ id: linkedRecord.id });
    expect(restoredLinkedRecord.deleted_at).toBeNull();
    expect(restoredLinkedRecord.plan_id).toBe(recordablePlan.id);

    // 削除済み Plan への新規リンクは app guard が先に落とす（NOT_FOUND）。
    // DB 側 trigger の DT001 は下の direct-writer テストが固定する。
    await expect(
      records.create({
        title: 'New link to deleted Plan',
        planId: recordablePlan.id,
        start_at: hoursAgo(12),
        end_at: hoursAgo(11),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(
      records.update({ id: record.id, data: { planId: recordablePlan.id } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const recordFromPlan = await createHistoricalPlan({
      title: 'Legacy one-tap recordable Plan',
      startAt: hoursAgo(30),
      endAt: hoursAgo(29),
    });
    const oneTapRecord = await plans.record({ id: recordFromPlan.id });
    expect(oneTapRecord.plan_id).toBe(recordFromPlan.id);
    expect(oneTapRecord.source).toBe('from_plan');

    const confirmablePlan = await createHistoricalPlan({
      title: 'Legacy confirm-day Plan',
      startAt: hoursAgo(2),
      endAt: hoursAgo(1),
    });

    const confirmedRecords = await plans.confirmDay({
      start_at: hoursAgo(2.5),
      end_at: hoursAgo(0.5),
    });
    expect(confirmedRecords.some((item) => item.plan_id === confirmablePlan.id)).toBe(true);

    const { data: tags, error: tagError } = await userClient
      .from('tags')
      .insert([
        { user_id: userId, name: 'Legacy source' },
        { user_id: userId, name: 'Legacy target' },
      ])
      .select()
      .order('name');
    if (tagError) throw tagError;

    const sourceTag = tags.find((tag) => tag.name === 'Legacy source')!;
    const targetTag = tags.find((tag) => tag.name === 'Legacy target')!;
    const retagged = await plans.update({ id: plan.id, data: { tagId: sourceTag.id } });
    expect(retagged.tag_id).toBe(sourceTag.id);

    const { error: mergeError } = await admin.rpc('merge_tags_with_hierarchy', {
      p_source_tag_id: sourceTag.id,
      p_target_tag_id: targetTag.id,
      p_user_id: userId,
    });
    expect(mergeError).toBeNull();

    const mergedPlan = await plans.getById({ id: plan.id });
    expect(mergedPlan.tag_id).toBe(targetTag.id);
  });

  // 直接 DML の残る writer は service_role だけになった。linked-Record invariant は
  // app guard ではなく DB trigger が担保しているので、その writer で固定する。
  it('still enforces linked-Record invariants for the remaining direct writer', async () => {
    const deletedPlan = await createHistoricalPlan({
      title: 'Direct writer deleted Plan',
      startAt: hoursAgo(26),
      endAt: hoursAgo(25),
    });
    const { error: deletePlanError } = await admin.rpc('soft_delete_plan', {
      p_plan_id: deletedPlan.id,
      p_user_id: userId,
    });
    expect(deletePlanError).toBeNull();

    const { data: standaloneRecord, error: standaloneRecordError } = await admin
      .from('records')
      .insert({
        user_id: userId,
        title: 'Direct writer standalone Record',
        source: 'manual',
        start_at: hoursAgo(24),
        end_at: hoursAgo(23),
      })
      .select('id')
      .single();
    if (standaloneRecordError) throw standaloneRecordError;

    const { error: newLinkError } = await admin.from('records').insert({
      user_id: userId,
      title: 'New link to deleted Plan',
      plan_id: deletedPlan.id,
      source: 'from_plan',
      start_at: hoursAgo(22),
      end_at: hoursAgo(21),
    });
    expect(newLinkError?.code).toBe('DT001');

    const { error: deletedNewLinkError } = await admin.from('records').insert({
      user_id: userId,
      title: 'Deleted new link to deleted Plan',
      plan_id: deletedPlan.id,
      source: 'from_plan',
      start_at: hoursAgo(22),
      end_at: hoursAgo(21),
      deleted_at: new Date().toISOString(),
    });
    expect(deletedNewLinkError?.code).toBe('DT001');

    const { error: deletedRelinkError } = await admin
      .from('records')
      .update({
        plan_id: deletedPlan.id,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', standaloneRecord.id);
    expect(deletedRelinkError?.code).toBe('DT001');

    const { error: relinkError } = await admin
      .from('records')
      .update({ plan_id: deletedPlan.id })
      .eq('id', standaloneRecord.id);
    expect(relinkError?.code).toBe('DT001');
  });

  it('still rejects restoring links to skipped or future Plans', async () => {
    const skippedPlan = await createHistoricalPlan({
      title: 'Skipped restore Plan',
      startAt: hoursAgo(10),
      endAt: hoursAgo(9),
    });
    // authenticated の直接 DML は Candidate 6 で閉じたので、fixture は
    // 残る direct writer（service_role）で作る
    const { data: skippedRecord, error: skippedRecordError } = await admin
      .from('records')
      .insert({
        user_id: userId,
        title: skippedPlan.title,
        plan_id: skippedPlan.id,
        source: 'from_plan',
        start_at: skippedPlan.start_at,
        end_at: skippedPlan.end_at,
      })
      .select('id')
      .single();
    if (skippedRecordError) throw skippedRecordError;

    await userClient.rpc('soft_delete_record', {
      p_record_id: skippedRecord.id,
      p_user_id: userId,
    });
    const { error: skipError } = await admin
      .from('plans')
      .update({ skipped_at: new Date().toISOString() })
      .eq('id', skippedPlan.id);
    expect(skipError).toBeNull();

    const { error: skippedRestoreError } = await admin.rpc('restore_record', {
      p_record_id: skippedRecord.id,
      p_user_id: userId,
    });
    expect(skippedRestoreError?.code).toBe('DT008');

    const futurePlanId = crypto.randomUUID();
    const futureRecordId = crypto.randomUUID();
    runOwnerSql(
      `
        INSERT INTO public.plans (
          id, user_id, title, source, start_at, end_at
        ) VALUES (
          :'plan_id'::UUID,
          :'user_id'::UUID,
          'Future restore Plan',
          'manual',
          pg_catalog.now() + INTERVAL '2 hours',
          pg_catalog.now() + INTERVAL '3 hours'
        );

        INSERT INTO public.records (
          id, user_id, plan_id, title, source, start_at, end_at
        ) VALUES (
          :'record_id'::UUID,
          :'user_id'::UUID,
          :'plan_id'::UUID,
          'Future restore Record',
          'from_plan',
          pg_catalog.now() + INTERVAL '2 hours',
          pg_catalog.now() + INTERVAL '3 hours'
        );
      `,
      {
        plan_id: futurePlanId,
        record_id: futureRecordId,
        user_id: userId,
      },
    );

    await userClient.rpc('soft_delete_record', {
      p_record_id: futureRecordId,
      p_user_id: userId,
    });
    const { error: futureRestoreError } = await admin.rpc('restore_record', {
      p_record_id: futureRecordId,
      p_user_id: userId,
    });
    expect(futureRestoreError?.code).toBe('DT013');
  });
});
