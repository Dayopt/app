import { spawnSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';
import { hashToken } from '@/lib/oauth-server';
import { derivePkceS256Challenge } from '@/lib/oauth-server/tokens';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

const productionResource = 'https://mcp.dayopt.app';
const stagingResource = 'https://mcp.staging.dayopt.app';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const verifier = 'v'.repeat(43);
const challenge = derivePkceS256Challenge(verifier);

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient<Database>(LOCAL_DB_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authenticated = createClient<Database>(LOCAL_DB_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = crypto.randomUUID();
const userEmail = `mcp-environment-${userId}@example.com`;
const userPassword = 'test-password-123';

describe.skipIf(!RUN_LOCAL)('MCP environment identity integration', () => {
  beforeAll(async () => {
    const { error } = await admin.auth.admin.createUser({
      id: userId,
      email: userEmail,
      password: userPassword,
      email_confirm: true,
    });
    if (error) throw error;

    const { error: signInError } = await authenticated.auth.signInWithPassword({
      email: userEmail,
      password: userPassword,
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    await authenticated.auth.signOut();
    await admin.auth.admin.deleteUser(userId);
  });

  it('exposes the exact tuple only through the service-role getter', async () => {
    const { data, error } = await admin.rpc('get_mcp_environment_identity_v1');
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({
        environment: 'production',
        authorization_server_uri: 'https://app.dayopt.app',
        resource_uri: productionResource,
      }),
    ]);

    const [{ error: anonGetterError }, { error: directReadError }, { error: directUpdateError }] =
      await Promise.all([
        anon.rpc('get_mcp_environment_identity_v1'),
        admin.from('mcp_environment_identity').select('environment'),
        admin
          .from('mcp_environment_identity')
          .update({ resource_uri: stagingResource })
          .eq('singleton_key', true),
      ]);

    expect(anonGetterError).not.toBeNull();
    expect(directReadError).not.toBeNull();
    expect(directUpdateError).not.toBeNull();
  });

  it('rejects a foreign resource through the singleton FK and grant boundary', async () => {
    const directInsert = runOwnerSql(`
      INSERT INTO public.oauth_connections (
        user_id,
        client_id,
        resource_uri,
        scopes
      ) VALUES (
        '${userId}'::UUID,
        'chatgpt',
        'https://mcp.staging.dayopt.app',
        ARRAY['read:entries']::TEXT[]
      );
    `);
    expect(directInsert.status).not.toBe(0);
    expect(directInsert.stderr).toContain('oauth_connections_environment_resource_fkey');

    const codeHash = hashToken(`wrong-resource-code-${crypto.randomUUID()}`);
    const { error: grantError } = await admin.rpc('create_oauth_authorization_grant_v2', {
      p_user_id: userId,
      p_client_id: 'chatgpt',
      p_resource_uri: stagingResource,
      p_scopes: ['read:entries'],
      p_code_hash: codeHash,
      p_redirect_uri: redirectUri,
      p_code_challenge: challenge,
      p_write_enabled: false,
    });
    expect(grantError).toMatchObject({ code: '22023' });

    const [{ data: connections }, { data: codes }] = await Promise.all([
      admin.from('oauth_connections').select('id').eq('user_id', userId),
      admin.from('oauth_authorization_codes').select('code_hash').eq('code_hash', codeHash),
    ]);
    expect(connections).toEqual([]);
    expect(codes).toEqual([]);
  });

  it('checks identity before consuming an authorization code', async () => {
    const code = `identity-code-${crypto.randomUUID()}`;
    const codeHash = hashToken(code);
    const { data: connectionId, error: grantError } = await admin.rpc(
      'create_oauth_authorization_grant_v2',
      {
        p_user_id: userId,
        p_client_id: 'chatgpt',
        p_resource_uri: productionResource,
        p_scopes: ['read:entries'],
        p_code_hash: codeHash,
        p_redirect_uri: redirectUri,
        p_code_challenge: challenge,
        p_write_enabled: false,
      },
    );
    expect(grantError).toBeNull();

    const wrongExchange = await admin.rpc('exchange_oauth_authorization_code_v2', {
      p_code_hash: codeHash,
      p_client_id: 'chatgpt',
      p_redirect_uri: redirectUri,
      p_resource_uri: stagingResource,
      p_code_challenge: challenge,
      p_refresh_hash: hashToken(`wrong-refresh-${crypto.randomUUID()}`),
      p_access_hash: hashToken(`wrong-access-${crypto.randomUUID()}`),
    });
    expect(wrongExchange.error).toMatchObject({ code: '22023' });

    const { data: unconsumedCode } = await admin
      .from('oauth_authorization_codes')
      .select('consumed_at')
      .eq('code_hash', codeHash)
      .single();
    expect(unconsumedCode?.consumed_at).toBeNull();

    const correctExchange = await admin.rpc('exchange_oauth_authorization_code_v2', {
      p_code_hash: codeHash,
      p_client_id: 'chatgpt',
      p_redirect_uri: redirectUri,
      p_resource_uri: productionResource,
      p_code_challenge: challenge,
      p_refresh_hash: hashToken(`correct-refresh-${crypto.randomUUID()}`),
      p_access_hash: hashToken(`correct-access-${crypto.randomUUID()}`),
    });
    expect(correctExchange.error).toBeNull();
    expect(correctExchange.data).toHaveLength(1);

    await admin.from('oauth_connections').delete().eq('id', connectionId!);
  });

  it('checks identity before refresh rotation or family revocation', async () => {
    const code = `refresh-identity-code-${crypto.randomUUID()}`;
    const refresh = `refresh-identity-${crypto.randomUUID()}`;
    const { data: connectionId } = await admin.rpc('create_oauth_authorization_grant_v2', {
      p_user_id: userId,
      p_client_id: 'chatgpt',
      p_resource_uri: productionResource,
      p_scopes: ['read:entries'],
      p_code_hash: hashToken(code),
      p_redirect_uri: redirectUri,
      p_code_challenge: challenge,
      p_write_enabled: false,
    });
    await admin.rpc('exchange_oauth_authorization_code_v2', {
      p_code_hash: hashToken(code),
      p_client_id: 'chatgpt',
      p_redirect_uri: redirectUri,
      p_resource_uri: productionResource,
      p_code_challenge: challenge,
      p_refresh_hash: hashToken(refresh),
      p_access_hash: hashToken(`refresh-access-${crypto.randomUUID()}`),
    });

    const wrongRotation = await admin.rpc('rotate_oauth_refresh_token_v2', {
      p_refresh_hash: hashToken(refresh),
      p_client_id: 'chatgpt',
      p_resource_uri: stagingResource,
      p_new_refresh_hash: hashToken(`wrong-new-refresh-${crypto.randomUUID()}`),
      p_new_access_hash: hashToken(`wrong-new-access-${crypto.randomUUID()}`),
    });
    expect(wrongRotation.error).toMatchObject({ code: '22023' });

    const { data: originalRefresh } = await admin
      .from('oauth_tokens')
      .select('revoked_at, rotated_at')
      .eq('token_hash', hashToken(refresh))
      .single();
    expect(originalRefresh).toEqual({ revoked_at: null, rotated_at: null });

    const correctRotation = await admin.rpc('rotate_oauth_refresh_token_v2', {
      p_refresh_hash: hashToken(refresh),
      p_client_id: 'chatgpt',
      p_resource_uri: productionResource,
      p_new_refresh_hash: hashToken(`correct-new-refresh-${crypto.randomUUID()}`),
      p_new_access_hash: hashToken(`correct-new-access-${crypto.randomUUID()}`),
    });
    expect(correctRotation.error).toBeNull();
    expect(correctRotation.data?.[0]?.status).toBe('issued');

    await admin.from('oauth_connections').delete().eq('id', connectionId!);
  });

  it('binds a legacy authorization-code insert to the database identity', async () => {
    const codeHash = hashToken(`legacy-code-${crypto.randomUUID()}`);
    const directInsert = runOwnerSql(`
      SELECT pg_catalog.set_config(
        'request.jwt.claims',
        '{"role":"service_role"}',
        false
      );

      INSERT INTO public.oauth_authorization_codes (
        code_hash,
        user_id,
        client_id,
        redirect_uri,
        code_challenge,
        code_challenge_method,
        scopes
      ) VALUES (
        '${codeHash}',
        '${userId}'::UUID,
        'unknown',
        'https://example.com/oauth/callback',
        '${challenge}',
        'S256',
        ARRAY['read:entries']::TEXT[]
      );
    `);
    expect(directInsert.status, directInsert.stderr).toBe(0);

    const { data: code, error: codeError } = await admin
      .from('oauth_authorization_codes')
      .select('connection_id, resource_uri')
      .eq('code_hash', codeHash)
      .single();
    expect(codeError).toBeNull();
    expect(code?.resource_uri).toBe(productionResource);

    const { data: connection, error: connectionError } = await admin
      .from('oauth_connections')
      .select('legacy_read_only, resource_uri')
      .eq('id', code!.connection_id)
      .single();
    expect(connectionError).toBeNull();
    expect(connection).toEqual({
      legacy_read_only: true,
      resource_uri: productionResource,
    });

    await admin.from('oauth_connections').delete().eq('id', code!.connection_id);
  });

  it('keeps the legacy token issuer service-role-only and DB-authored', async () => {
    const callerExpiry = '2100-01-01T00:00:00.000Z';
    const refreshHash = hashToken(`legacy-refresh-${crypto.randomUUID()}`);
    const accessHash = hashToken(`legacy-access-${crypto.randomUUID()}`);
    const callLegacyIssuer = (client: typeof admin, suffix: string) =>
      client.rpc('issue_oauth_token_pair', {
        p_user_id: userId,
        p_client_id: 'unknown',
        p_scopes: ['read:entries'],
        p_refresh_hash: hashToken(`legacy-refresh-${suffix}-${crypto.randomUUID()}`),
        p_access_hash: hashToken(`legacy-access-${suffix}-${crypto.randomUUID()}`),
        p_refresh_expires_at: callerExpiry,
        p_access_expires_at: callerExpiry,
      });

    const privilegeCheck = runOwnerSql(`
      DO $$
      BEGIN
        IF pg_catalog.has_function_privilege(
          'anon',
          'public.issue_oauth_token_pair(uuid,text,text[],text,text,timestamptz,timestamptz,uuid)',
          'EXECUTE'
        ) OR pg_catalog.has_function_privilege(
          'authenticated',
          'public.issue_oauth_token_pair(uuid,text,text[],text,text,timestamptz,timestamptz,uuid)',
          'EXECUTE'
        ) THEN
          RAISE EXCEPTION 'Legacy issuer must be service-role-only';
        END IF;
      END;
      $$;
    `);
    expect(privilegeCheck.status, privilegeCheck.stderr).toBe(0);

    const { error: authenticatedError } = await callLegacyIssuer(authenticated, 'authenticated');
    expect(authenticatedError?.code).toBe('42501');

    const issuedAt = Date.now();
    const { data: pair, error: issueError } = await admin.rpc('issue_oauth_token_pair', {
      p_user_id: userId,
      p_client_id: 'unknown',
      p_scopes: ['read:entries'],
      p_refresh_hash: refreshHash,
      p_access_hash: accessHash,
      p_refresh_expires_at: callerExpiry,
      p_access_expires_at: callerExpiry,
    });
    expect(issueError).toBeNull();
    expect(pair).toHaveLength(1);

    const tokenIds = [pair![0]!.refresh_id, pair![0]!.access_id];
    const { data: tokens, error: tokenError } = await admin
      .from('oauth_tokens')
      .select('id, connection_id, token_type, resource_uri, expires_at')
      .in('id', tokenIds);
    expect(tokenError).toBeNull();
    expect(tokens).toHaveLength(2);
    expect(tokens?.every((token) => token.resource_uri === productionResource)).toBe(true);
    expect(new Set(tokens?.map((token) => token.connection_id)).size).toBe(1);

    const refresh = tokens?.find((token) => token.token_type === 'refresh');
    const access = tokens?.find((token) => token.token_type === 'access');
    expect(new Date(refresh!.expires_at).getTime()).toBeLessThan(
      issuedAt + 31 * 24 * 60 * 60 * 1_000,
    );
    expect(new Date(access!.expires_at).getTime()).toBeLessThan(issuedAt + 6 * 60 * 1_000);

    const connectionId = tokens![0]!.connection_id;
    const { data: connection } = await admin
      .from('oauth_connections')
      .select('legacy_read_only')
      .eq('id', connectionId)
      .single();
    expect(connection?.legacy_read_only).toBe(true);

    await admin.from('oauth_connections').delete().eq('id', connectionId);
  });

  it('allows only same-value provision retries after identity creation', async () => {
    const sameIdentity = await admin.rpc('provision_mcp_environment_identity_v1', {
      p_environment: 'production',
      p_authorization_server_uri: 'https://app.dayopt.app',
      p_resource_uri: productionResource,
    });
    expect(sameIdentity.error).toBeNull();
    expect(sameIdentity.data?.[0]?.environment).toBe('production');

    const conflictingIdentity = await admin.rpc('provision_mcp_environment_identity_v1', {
      p_environment: 'staging',
      p_authorization_server_uri: 'https://staging.dayopt.app',
      p_resource_uri: stagingResource,
    });
    expect(conflictingIdentity.error).toMatchObject({ code: 'DI002' });
  });
});

function runOwnerSql(sql: string) {
  return spawnSync(
    'psql',
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres'],
    {
      env: { ...process.env, PGPASSWORD: 'postgres' },
      input: sql,
      encoding: 'utf8',
    },
  );
}
