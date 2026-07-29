import { spawnSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';
import { hashToken } from '@/lib/oauth-server';

import { deriveStage1PkceS256Challenge } from './mcp-stage1-crypto';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';
const productionResource = 'https://mcp.dayopt.app';
const foreignResource = 'https://mcp.staging.dayopt.app';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const challenge = deriveStage1PkceS256Challenge('v'.repeat(43));

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authenticated = createClient<Database>(LOCAL_DB_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = crypto.randomUUID();
const email = `mcp-environment-${userId}@example.com`;
const password = 'test-password-123';

function runOwnerSql(sql: string) {
  return spawnSync(
    'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
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
}

describe.skipIf(!RUN_LOCAL)('MCP environment identity integration', () => {
  beforeAll(async () => {
    const { error } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;

    const { error: signInError } = await authenticated.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    await authenticated.auth.signOut();
    await admin.auth.admin.deleteUser(userId);
  });

  it('exposes the immutable tuple only through the service-role getter', async () => {
    const { data, error } = await admin.rpc('get_mcp_environment_identity_v1');
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({
        environment: 'production',
        authorization_server_uri: 'https://app.dayopt.app',
        resource_uri: productionResource,
        supabase_project_ref: null,
      }),
    ]);

    const [{ error: browserGetterError }, { error: directReadError }] = await Promise.all([
      authenticated.rpc('get_mcp_environment_identity_v1'),
      admin.from('mcp_environment_identity').select('environment'),
    ]);
    expect(browserGetterError?.code).toBe('42501');
    expect(directReadError?.code).toBe('42501');

    const immutableUpdate = runOwnerSql(`
      UPDATE public.mcp_environment_identity
      SET resource_uri = '${foreignResource}'
      WHERE singleton_key = true;
    `);
    expect(immutableUpdate.status).not.toBe(0);
    expect(immutableUpdate.stderr).toContain('MCP environment identity is immutable');
  });

  it('rejects a foreign resource before creating or consuming authority', async () => {
    const directInsert = runOwnerSql(`
      INSERT INTO public.oauth_connections (
        user_id,
        client_id,
        resource_uri,
        scopes
      ) VALUES (
        '${userId}'::UUID,
        'chatgpt',
        '${foreignResource}',
        ARRAY['read:entries']::TEXT[]
      );
    `);
    expect(directInsert.status).not.toBe(0);
    expect(directInsert.stderr).toContain('oauth_connections_environment_resource_fkey');

    const codeHash = hashToken(`foreign-resource-${crypto.randomUUID()}`);
    const { error: grantError } = await admin.rpc('create_oauth_authorization_grant_v2', {
      p_user_id: userId,
      p_client_id: 'chatgpt',
      p_resource_uri: foreignResource,
      p_scopes: ['read:entries'],
      p_code_hash: codeHash,
      p_redirect_uri: redirectUri,
      p_code_challenge: challenge,
      p_write_enabled: false,
    });
    expect(grantError?.code).toBe('22023');

    const { count: codeCount } = await admin
      .from('oauth_authorization_codes')
      .select('code_hash', { count: 'exact', head: true })
      .eq('code_hash', codeHash);
    expect(codeCount).toBe(0);
  });

  it('provisions one exact data-less Preview identity and rejects replacement', () => {
    const previewRef = 'abcdefghijklmnopqrst';
    const previewUrl = 'https://product-git-mcp-safe-dayopt.vercel.app';
    const previewProof = runOwnerSql(`
      BEGIN;

      TRUNCATE auth.users CASCADE;
      UPDATE public.mcp_mutation_control
      SET
        writes_enabled = false,
        enabled_client_ids = ARRAY[]::TEXT[],
        revision = revision + 1,
        changed_at = pg_catalog.clock_timestamp()
      WHERE singleton_key = true;

      ALTER TABLE public.mcp_environment_identity
        DISABLE TRIGGER trigger_prevent_mcp_environment_identity_change;
      DELETE FROM public.mcp_environment_identity;
      ALTER TABLE public.mcp_environment_identity
        ENABLE TRIGGER trigger_prevent_mcp_environment_identity_change;

      DO $$
      BEGIN
        PERFORM pg_catalog.set_config(
          'request.jwt.claims',
          '{"role":"service_role","ref":"${previewRef}"}',
          true
        );
      END;
      $$;

      SELECT resource_uri
      FROM public.provision_mcp_preview_environment_identity_v1(
        '${previewUrl}',
        '${previewUrl}',
        '${previewRef}'
      );

      SELECT resource_uri
      FROM public.provision_mcp_preview_environment_identity_v1(
        '${previewUrl}',
        '${previewUrl}',
        '${previewRef}'
      );

      DO $$
      DECLARE
        v_replacement_rejected BOOLEAN := false;
        v_update_rejected BOOLEAN := false;
      BEGIN
        BEGIN
          PERFORM *
          FROM public.provision_mcp_preview_environment_identity_v1(
            'https://product-git-other-dayopt.vercel.app',
            'https://product-git-other-dayopt.vercel.app',
            '${previewRef}'
          );
        EXCEPTION WHEN SQLSTATE 'DI002' THEN
          v_replacement_rejected := true;
        END;

        BEGIN
          UPDATE public.mcp_environment_identity
          SET authorization_server_uri = 'https://product-git-other-dayopt.vercel.app'
          WHERE singleton_key = true;
        EXCEPTION WHEN check_violation THEN
          v_update_rejected := true;
        END;

        IF NOT v_replacement_rejected OR NOT v_update_rejected THEN
          RAISE EXCEPTION 'Preview identity replacement was not rejected';
        END IF;
      END;
      $$;

      ROLLBACK;
    `);

    expect(previewProof.status, previewProof.stderr).toBe(0);
    expect(previewProof.stdout.trim().split('\n')).toEqual([previewUrl, previewUrl]);
  });
});
