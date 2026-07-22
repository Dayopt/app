import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';
import { verifyAccessToken } from '@/lib/mcp/auth';
import { hashToken } from '@/lib/oauth-server';
import { derivePkceS256Challenge } from '@/lib/oauth-server/tokens';

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
const email = `oauth-connection-${userId}@example.com`;
const password = 'test-password-123';
const resource = 'https://mcp.dayopt.app';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const verifier = 'v'.repeat(43);
const challenge = derivePkceS256Challenge(verifier);

describe.skipIf(!RUN_LOCAL)('OAuth connection lifecycle integration', () => {
  beforeAll(async () => {
    const { error } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
  });

  afterAll(async () => {
    await userClient.auth.signOut();
    await admin.auth.admin.deleteUser(userId);
  });

  it('atomically exchanges once, bounds TTLs, and verifies the resource connection', async () => {
    const code = `code-${crypto.randomUUID()}`;
    const access = `dop_at_${crypto.randomUUID()}`;
    const refresh = `dop_rt_${crypto.randomUUID()}`;
    const { data: connectionId, error: grantError } = await admin.rpc(
      'create_oauth_authorization_grant_v2',
      {
        p_user_id: userId,
        p_client_id: 'chatgpt',
        p_resource_uri: resource,
        p_scopes: ['read:entries'],
        p_code_hash: hashToken(code),
        p_redirect_uri: redirectUri,
        p_code_challenge: challenge,
        p_write_enabled: false,
      },
    );
    expect(grantError).toBeNull();

    const exchangeArgs = {
      p_code_hash: hashToken(code),
      p_client_id: 'chatgpt',
      p_redirect_uri: redirectUri,
      p_resource_uri: resource,
      p_code_challenge: challenge,
      p_refresh_hash: hashToken(refresh),
      p_access_hash: hashToken(access),
    };
    const [first, second] = await Promise.all([
      admin.rpc('exchange_oauth_authorization_code_v2', exchangeArgs),
      admin.rpc('exchange_oauth_authorization_code_v2', {
        ...exchangeArgs,
        p_refresh_hash: hashToken(`${refresh}-retry`),
        p_access_hash: hashToken(`${access}-retry`),
      }),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const issued = [first.data, second.data].filter((rows) => rows && rows.length === 1);
    expect(issued).toHaveLength(1);

    const { data: tokens, error: tokenError } = await admin
      .from('oauth_tokens')
      .select('token_type, connection_id, created_at, expires_at')
      .eq('connection_id', connectionId!);
    expect(tokenError).toBeNull();
    expect(tokens).toHaveLength(2);
    for (const token of tokens ?? []) {
      const ttlMs = new Date(token.expires_at).getTime() - new Date(token.created_at).getTime();
      const maxMs =
        token.token_type === 'access' ? 5 * 60_000 + 1_000 : 30 * 24 * 60 * 60_000 + 1_000;
      expect(ttlMs).toBeLessThanOrEqual(maxMs);
      expect(token.connection_id).toBe(connectionId);
    }

    const winningAccess = first.data?.length === 1 ? access : `${access}-retry`;
    const verified = await verifyAccessToken(winningAccess);
    expect(verified).toMatchObject({
      connectionId,
      userId,
      clientId: 'chatgpt',
      scopes: ['read:entries'],
      resourceUri: resource,
    });
  });

  it.each([
    {
      clientId: 'claude-ai',
      clientRedirectUri: 'https://claude.ai/api/mcp/auth_callback',
    },
    {
      clientId: 'chatgpt',
      clientRedirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    },
    {
      clientId: 'cursor',
      clientRedirectUri: 'cursor://anysphere.cursor-mcp/oauth/callback',
    },
  ])(
    'tolerates a parallel $clientId refresh retry without revoking the winner',
    async ({ clientId, clientRedirectUri }) => {
      const code = `code-${crypto.randomUUID()}`;
      const originalRefresh = `dop_rt_${crypto.randomUUID()}`;
      const { data: connectionId, error: grantError } = await admin.rpc(
        'create_oauth_authorization_grant_v2',
        {
          p_user_id: userId,
          p_client_id: clientId,
          p_resource_uri: resource,
          p_scopes: ['read:entries'],
          p_code_hash: hashToken(code),
          p_redirect_uri: clientRedirectUri,
          p_code_challenge: challenge,
          p_write_enabled: false,
        },
      );
      expect(grantError).toBeNull();
      const { error: exchangeError } = await admin.rpc('exchange_oauth_authorization_code_v2', {
        p_code_hash: hashToken(code),
        p_client_id: clientId,
        p_redirect_uri: clientRedirectUri,
        p_resource_uri: resource,
        p_code_challenge: challenge,
        p_refresh_hash: hashToken(originalRefresh),
        p_access_hash: hashToken(`dop_at_${crypto.randomUUID()}`),
      });
      expect(exchangeError).toBeNull();

      const rotate = (suffix: string) =>
        admin.rpc('rotate_oauth_refresh_token_v2', {
          p_refresh_hash: hashToken(originalRefresh),
          p_client_id: clientId,
          p_resource_uri: resource,
          p_new_refresh_hash: hashToken(`dop_rt_${suffix}-${crypto.randomUUID()}`),
          p_new_access_hash: hashToken(`dop_at_${suffix}-${crypto.randomUUID()}`),
        });
      const [first, second] = await Promise.all([rotate('first'), rotate('second')]);
      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect([first.data?.[0]?.status, second.data?.[0]?.status].sort()).toEqual([
        'issued',
        'retryable_duplicate',
      ]);

      const { data: connection } = await admin
        .from('oauth_connections')
        .select('revoked_at')
        .eq('id', connectionId!)
        .single();
      expect(connection?.revoked_at).toBeNull();
    },
  );

  it('makes the connection unusable immediately after user revocation', async () => {
    const access = `dop_at_${crypto.randomUUID()}`;
    const refresh = `dop_rt_${crypto.randomUUID()}`;
    const code = `code-${crypto.randomUUID()}`;
    const { data: connectionId } = await admin.rpc('create_oauth_authorization_grant_v2', {
      p_user_id: userId,
      p_client_id: 'chatgpt',
      p_resource_uri: resource,
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
      p_resource_uri: resource,
      p_code_challenge: challenge,
      p_refresh_hash: hashToken(refresh),
      p_access_hash: hashToken(access),
    });
    await expect(verifyAccessToken(access)).resolves.toMatchObject({ connectionId });

    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();
    const { data: revoked, error: revokeError } = await userClient.rpc('revoke_oauth_connection', {
      p_connection_id: connectionId!,
    });
    expect(revokeError).toBeNull();
    expect(revoked).toBe(true);

    await expect(verifyAccessToken(access)).rejects.toMatchObject({
      code: 'invalid_grant',
      httpStatus: 401,
    });
  });
});
