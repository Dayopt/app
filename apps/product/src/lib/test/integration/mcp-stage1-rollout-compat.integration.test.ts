import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';
import { exchangeAuthorizationCode, refreshAccessToken } from '@/lib/oauth-server';
import { generateAuthorizationCode, hashToken } from '@/lib/oauth-server/tokens';

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
    const { data: insertedCode, error: codeError } = await admin
      .from('oauth_authorization_codes')
      .insert({
        user_id: userId,
        client_id: 'chatgpt',
        code_hash: authorizationCode.hash,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
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

  it('keeps every current Plan and Record write path available', async () => {
    const { data: plan, error: createPlanError } = await userClient
      .from('plans')
      .insert({
        user_id: userId,
        title: 'Legacy Plan',
        source: 'manual',
        start_at: hoursAgo(-1),
        end_at: hoursAgo(-2),
      })
      .select()
      .single();
    if (createPlanError) throw createPlanError;

    const { data: updatedPlan, error: updatePlanError } = await userClient
      .from('plans')
      .update({ title: 'Legacy Plan updated' })
      .eq('id', plan.id)
      .select()
      .single();
    expect(updatePlanError).toBeNull();
    expect(updatedPlan?.title).toBe('Legacy Plan updated');

    const historicalPlan = await createHistoricalPlan({
      title: 'Existing past Plan',
      startAt: hoursAgo(8),
      endAt: hoursAgo(7),
    });

    const { data: skippedPlan, error: skipError } = await userClient
      .from('plans')
      .update({ skipped_at: new Date().toISOString() })
      .eq('id', historicalPlan.id)
      .select()
      .single();
    expect(skipError).toBeNull();
    expect(skippedPlan?.skipped_at).not.toBeNull();

    const { data: unskippedPlan, error: unskipError } = await userClient
      .from('plans')
      .update({ skipped_at: null })
      .eq('id', historicalPlan.id)
      .select()
      .single();
    expect(unskipError).toBeNull();
    expect(unskippedPlan?.skipped_at).toBeNull();

    const { error: deletePlanError } = await userClient.rpc('soft_delete_plan', {
      p_plan_id: plan.id,
      p_user_id: userId,
    });
    expect(deletePlanError).toBeNull();

    const { error: restorePlanError } = await admin.rpc('restore_plan', {
      p_plan_id: plan.id,
      p_user_id: userId,
    });
    expect(restorePlanError).toBeNull();

    const { data: record, error: createRecordError } = await userClient
      .from('records')
      .insert({
        user_id: userId,
        title: 'Legacy Record',
        source: 'manual',
        start_at: hoursAgo(6),
        end_at: hoursAgo(5),
      })
      .select()
      .single();
    if (createRecordError) throw createRecordError;

    const { data: updatedRecord, error: updateRecordError } = await userClient
      .from('records')
      .update({ title: 'Legacy Record updated' })
      .eq('id', record.id)
      .select()
      .single();
    expect(updateRecordError).toBeNull();
    expect(updatedRecord?.title).toBe('Legacy Record updated');

    const { error: deleteRecordError } = await userClient.rpc('soft_delete_record', {
      p_record_id: record.id,
      p_user_id: userId,
    });
    expect(deleteRecordError).toBeNull();

    const { error: restoreRecordError } = await admin.rpc('restore_record', {
      p_record_id: record.id,
      p_user_id: userId,
    });
    expect(restoreRecordError).toBeNull();

    const recordablePlan = await createHistoricalPlan({
      title: 'Legacy recordable Plan',
      startAt: hoursAgo(4),
      endAt: hoursAgo(3),
    });

    const { data: linkedRecord, error: linkedRecordError } = await userClient
      .from('records')
      .insert({
        user_id: userId,
        title: recordablePlan.title,
        plan_id: recordablePlan.id,
        source: 'from_plan',
        start_at: recordablePlan.start_at,
        end_at: recordablePlan.end_at,
      })
      .select()
      .single();
    expect(linkedRecordError).toBeNull();
    expect(linkedRecord?.plan_id).toBe(recordablePlan.id);

    const { error: deleteLinkedPlanError } = await userClient.rpc('soft_delete_plan', {
      p_plan_id: recordablePlan.id,
      p_user_id: userId,
    });
    expect(deleteLinkedPlanError).toBeNull();

    const { data: activeLinkedRecord, error: activeLinkedRecordError } = await userClient
      .from('records')
      .select('deleted_at, plan_id')
      .eq('id', linkedRecord!.id)
      .single();
    expect(activeLinkedRecordError).toBeNull();
    expect(activeLinkedRecord).toEqual({
      deleted_at: null,
      plan_id: recordablePlan.id,
    });

    const { error: deleteLinkedRecordError } = await userClient.rpc('soft_delete_record', {
      p_record_id: linkedRecord!.id,
      p_user_id: userId,
    });
    expect(deleteLinkedRecordError).toBeNull();

    const { error: restoreLinkedRecordError } = await admin.rpc('restore_record', {
      p_record_id: linkedRecord!.id,
      p_user_id: userId,
    });
    expect(restoreLinkedRecordError).toBeNull();

    const { data: restoredLinkedRecord, error: restoredLinkedRecordError } = await userClient
      .from('records')
      .select('deleted_at, plan_id')
      .eq('id', linkedRecord!.id)
      .single();
    expect(restoredLinkedRecordError).toBeNull();
    expect(restoredLinkedRecord).toEqual({
      deleted_at: null,
      plan_id: recordablePlan.id,
    });

    const { error: newLinkError } = await userClient.from('records').insert({
      user_id: userId,
      title: 'New link to deleted Plan',
      plan_id: recordablePlan.id,
      source: 'from_plan',
      start_at: hoursAgo(12),
      end_at: hoursAgo(11),
    });
    expect(newLinkError?.code).toBe('DT001');

    const { error: deletedNewLinkError } = await userClient.from('records').insert({
      user_id: userId,
      title: 'Deleted new link to deleted Plan',
      plan_id: recordablePlan.id,
      source: 'from_plan',
      start_at: hoursAgo(14),
      end_at: hoursAgo(13),
      deleted_at: new Date().toISOString(),
    });
    expect(deletedNewLinkError?.code).toBe('DT001');

    const { error: deletedRelinkError } = await userClient
      .from('records')
      .update({
        plan_id: recordablePlan.id,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', record.id);
    expect(deletedRelinkError?.code).toBe('DT001');

    const { error: relinkError } = await userClient
      .from('records')
      .update({ plan_id: recordablePlan.id })
      .eq('id', record.id);
    expect(relinkError?.code).toBe('DT001');

    const confirmablePlan = await createHistoricalPlan({
      title: 'Legacy confirm-day Plan',
      startAt: hoursAgo(2),
      endAt: hoursAgo(1),
    });

    const { data: confirmedRecords, error: confirmError } = await userClient.rpc(
      'confirm_day_plans_to_records',
      {
        p_user_id: userId,
        p_start_at: hoursAgo(2.5),
        p_end_at: hoursAgo(0.5),
        p_confirmed_at: new Date().toISOString(),
      },
    );
    expect(confirmError).toBeNull();
    expect(confirmedRecords?.some((item) => item.plan_id === confirmablePlan.id)).toBe(true);

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
    const { error: tagPlanError } = await userClient
      .from('plans')
      .update({ tag_id: sourceTag.id })
      .eq('id', plan.id);
    expect(tagPlanError).toBeNull();

    const { error: mergeError } = await admin.rpc('merge_tags_with_hierarchy', {
      p_source_tag_id: sourceTag.id,
      p_target_tag_id: targetTag.id,
      p_user_id: userId,
    });
    expect(mergeError).toBeNull();

    const { data: retaggedPlan, error: retagError } = await userClient
      .from('plans')
      .select('tag_id')
      .eq('id', plan.id)
      .single();
    expect(retagError).toBeNull();
    expect(retaggedPlan?.tag_id).toBe(targetTag.id);
  });

  it('still rejects restoring links to skipped or future Plans', async () => {
    const skippedPlan = await createHistoricalPlan({
      title: 'Skipped restore Plan',
      startAt: hoursAgo(10),
      endAt: hoursAgo(9),
    });
    const { data: skippedRecord, error: skippedRecordError } = await userClient
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
    await userClient
      .from('plans')
      .update({ skipped_at: new Date().toISOString() })
      .eq('id', skippedPlan.id);

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
