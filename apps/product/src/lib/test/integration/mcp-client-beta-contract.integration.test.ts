import { spawnSync } from 'node:child_process';

import { NextRequest } from 'next/server';

import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { POST as postMcp } from '@/app/api/mcp/route';
import { POST as postToken } from '@/app/api/oauth/token/route';
import type { Database } from '@/lib/database';
import { hashToken, type OAuthClientId } from '@/lib/oauth-server';
import { derivePkceS256Challenge } from '@/lib/oauth-server/tokens';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';
const RESOURCE = 'https://mcp.dayopt.app';
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = derivePkceS256Challenge(VERIFIER);

const CLIENTS = [
  {
    clientId: 'claude-ai',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  },
  {
    clientId: 'chatgpt',
    redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
  },
  {
    clientId: 'cursor',
    redirectUri: 'cursor://anysphere.cursor-mcp/oauth/callback',
  },
] as const satisfies readonly {
  clientId: OAuthClientId;
  redirectUri: string;
}[];

const ALL_SCOPES = [
  'read:entries',
  'read:tags',
  'read:constraints',
  'read:stats',
  'write:plans',
  'delete:plans',
  'write:records',
  'delete:records',
] as const;

const ALL_TOOL_NAMES = [
  'entries.list',
  'tags.list',
  'constraints.get',
  'review.get',
  'plans.list',
  'plans.get',
  'plans.create',
  'plans.update',
  'plans.trash.list',
  'plans.delete',
  'plans.restore',
  'records.list',
  'records.get',
  'records.create',
  'records.update',
  'records.trash.list',
  'records.delete',
  'records.restore',
] as const;

const READ_TOOL_NAMES = [
  'entries.list',
  'tags.list',
  'constraints.get',
  'review.get',
  'plans.list',
  'plans.get',
  'records.list',
  'records.get',
] as const;

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.literal('Bearer'),
    expires_in: z.number().int().nonnegative(),
    refresh_token: z.string().min(1),
    scope: z.string(),
  })
  .strict();

const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationId: z.string().uuid(),
    resourceType: z.literal('plan'),
    resourceId: z.string().uuid(),
    version: z.string().datetime({ offset: true }),
    deletedAt: z.null(),
    replayed: z.boolean(),
  })
  .strict();

const oauthErrorSchema = z
  .object({
    error: z.literal('invalid_grant'),
  })
  .passthrough();

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const userClient = createClient<Database>(LOCAL_DB_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = crypto.randomUUID();
const email = `mcp-client-beta-${userId}@example.com`;
const password = 'test-password-123';

let originalControl:
  | {
      writes_enabled: boolean;
      enabled_client_ids: string[];
      revision: number;
    }
  | undefined;

describe.skipIf(!RUN_LOCAL)('MCP 3-client beta contract integration', () => {
  beforeAll(async () => {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_DB_URL) {
      throw new Error('MCP client beta integration requires the local Supabase URL');
    }

    originalControl = await readMutationControl();
    if (originalControl.writes_enabled) {
      throw new Error('MCP client beta integration requires the global write gate to start OFF');
    }

    const { count: existingConnectionCount, error: existingConnectionError } = await admin
      .from('oauth_connections')
      .select('id', { count: 'exact', head: true })
      .in(
        'client_id',
        CLIENTS.map(({ clientId }) => clientId),
      )
      .is('revoked_at', null);
    if (existingConnectionError) throw existingConnectionError;
    if (existingConnectionCount !== 0) {
      throw new Error(
        'MCP client beta integration requires a clean local OAuth connection baseline',
      );
    }

    vi.stubEnv('MCP_WRITE_ENABLED_CLIENTS', CLIENTS.map(({ clientId }) => clientId).join(','));
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const { error: createUserError } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (createUserError) throw createUserError;

    const { error: profileError } = await admin
      .from('profiles')
      .update({ subscription_status: 'active' })
      .eq('id', userId);
    if (profileError) throw profileError;

    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    for (const { clientId } of CLIENTS) {
      if (!originalControl.enabled_client_ids.includes(clientId)) {
        await setClientWriteControl(clientId, true);
      }
    }
    if (!originalControl.writes_enabled) {
      await setMutationControl(true);
    }
  });

  afterEach(async () => {
    const { error: recordError } = await admin.from('records').delete().eq('user_id', userId);
    if (recordError) throw recordError;
    const { error: planError } = await admin.from('plans').delete().eq('user_id', userId);
    if (planError) throw planError;
  });

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];

    try {
      try {
        await setMutationControl(false);
      } catch (error) {
        cleanupErrors.push(error);
        try {
          forceMutationControlOffFixture();
        } catch (fixtureError) {
          cleanupErrors.push(fixtureError);
        }
      }

      if (originalControl) {
        try {
          restoreMutationControlFixture(originalControl);
        } catch (error) {
          cleanupErrors.push(error);
          try {
            forceMutationControlOffFixture();
          } catch (fixtureError) {
            cleanupErrors.push(fixtureError);
          }
        }
      }

      try {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
      } catch (error) {
        cleanupErrors.push(error);
      }

      try {
        const { error } = await userClient.auth.signOut();
        if (error) throw error;
      } catch (error) {
        cleanupErrors.push(error);
      }
    } finally {
      vi.unstubAllEnvs();
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'MCP client beta integration cleanup failed');
    }
  });

  it.each(CLIENTS)(
    '$clientIdはactual token route、tools/list、retry、refresh、revokeで同じ契約を保つ',
    async ({ clientId, redirectUri }) => {
      const { connectionId, tokens } = await authorizeClient(clientId, redirectUri);

      const initialTools = await listTools(tokens.access_token);
      expect(initialTools.map(({ name }) => name)).toEqual(ALL_TOOL_NAMES);
      for (const tool of initialTools.filter(({ name }) => name.includes('.create'))) {
        expect(tool.inputSchema.properties).not.toHaveProperty('confirmed');
        expect(tool.inputSchema.properties).not.toHaveProperty('idempotencyKey');
      }

      const operationId = crypto.randomUUID();
      const startAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const endAt = new Date(Date.now() + 90 * 60_000).toISOString();
      const args = {
        operationId,
        title: `${clientId} beta contract`,
        note: null,
        tagId: null,
        startAt,
        endAt,
      };

      const applied = receiptSchema.parse(
        await callTool(tokens.access_token, 'plans.create', args),
      );
      expect(applied).toMatchObject({ operationId, replayed: false });

      const replayed = receiptSchema.parse(
        await callTool(tokens.access_token, 'plans.create', args),
      );
      expect(replayed).toMatchObject({
        operationId,
        resourceId: applied.resourceId,
        replayed: true,
      });

      const reused = await callToolResult(tokens.access_token, 'plans.create', {
        ...args,
        title: `${clientId} reused operation`,
      });
      expect(reused.isError).toBe(true);
      expect(parseToolText(reused)).toMatchObject({
        error: { code: 'IDEMPOTENCY_KEY_REUSED', retryable: false },
      });

      const [{ data: plans, error: planError }, { data: receipts, error: receiptError }] =
        await Promise.all([
          admin.from('plans').select('id,title,note,tag_id,start_at,end_at').eq('user_id', userId),
          admin
            .from('mcp_mutation_receipts')
            .select('client_id,operation_id,tool_name')
            .eq('user_id', userId)
            .eq('operation_id', operationId),
        ]);
      if (planError) throw planError;
      if (receiptError) throw receiptError;
      const normalizedPlans = plans?.map((plan) => ({
        ...plan,
        start_at: new Date(plan.start_at).toISOString(),
        end_at: new Date(plan.end_at).toISOString(),
      }));
      expect(normalizedPlans).toEqual([
        {
          id: applied.resourceId,
          title: args.title,
          note: args.note,
          tag_id: args.tagId,
          start_at: args.startAt,
          end_at: args.endAt,
        },
      ]);
      expect(receipts).toEqual([
        {
          client_id: clientId,
          operation_id: operationId,
          tool_name: 'plans.create',
        },
      ]);

      await setMutationControl(false);
      try {
        const readOnlyTools = await listTools(tokens.access_token);
        expect(readOnlyTools.map(({ name }) => name)).toEqual(READ_TOOL_NAMES);

        const deniedOperationId = crypto.randomUUID();
        const denied = await rawMcpRequest(tokens.access_token, {
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'tools/call',
          params: {
            name: 'plans.create',
            arguments: { ...args, operationId: deniedOperationId },
          },
        });
        expect(denied.status).toBe(403);
        expect(denied.headers.get('www-authenticate')).toContain('error="insufficient_scope"');

        const [
          { data: plansAfterDenied, error: plansAfterDeniedError },
          { data: deniedReceipts, error: deniedReceiptError },
        ] = await Promise.all([
          admin.from('plans').select('id,title,note,tag_id,start_at,end_at').eq('user_id', userId),
          admin
            .from('mcp_mutation_receipts')
            .select('operation_id')
            .eq('user_id', userId)
            .eq('operation_id', deniedOperationId),
        ]);
        if (plansAfterDeniedError) throw plansAfterDeniedError;
        if (deniedReceiptError) throw deniedReceiptError;
        expect(plansAfterDenied).toEqual(plans);
        expect(deniedReceipts).toEqual([]);
      } finally {
        await setMutationControl(true);
      }

      expect((await listTools(tokens.access_token)).map(({ name }) => name)).toEqual(
        ALL_TOOL_NAMES,
      );

      const refreshResponses = await Promise.all([
        refreshClient(clientId, tokens.refresh_token),
        refreshClient(clientId, tokens.refresh_token),
      ]);
      expect(refreshResponses.map(({ status }) => status).sort()).toEqual([200, 400]);
      const issued = refreshResponses.find(({ status }) => status === 200);
      const rejected = refreshResponses.find(({ status }) => status === 400);
      if (!issued || !rejected) throw new Error('Parallel refresh did not select one winner');
      expect(oauthErrorSchema.parse(await rejected.json())).toEqual(
        expect.objectContaining({ error: 'invalid_grant' }),
      );
      const refreshed = tokenResponseSchema.parse(await issued.json());
      expect((await listTools(refreshed.access_token)).map(({ name }) => name)).toEqual(
        ALL_TOOL_NAMES,
      );

      const nextRefreshResponse = await refreshClient(clientId, refreshed.refresh_token);
      expect(nextRefreshResponse.status).toBe(200);
      const latestTokens = tokenResponseSchema.parse(await nextRefreshResponse.json());
      const peer = await authorizeClient(clientId, redirectUri);

      const { data: revoked, error: revokeError } = await userClient.rpc(
        'revoke_oauth_connection',
        { p_connection_id: connectionId },
      );
      if (revokeError) throw revokeError;
      expect(revoked).toBe(true);

      for (const accessToken of [
        tokens.access_token,
        refreshed.access_token,
        latestTokens.access_token,
      ]) {
        const response = await rawMcpRequest(accessToken, {
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'tools/list',
        });
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ error: 'invalid_token' });
      }

      const revokedRefresh = await refreshClient(clientId, latestTokens.refresh_token);
      expect(revokedRefresh.status).toBe(400);
      expect(oauthErrorSchema.parse(await revokedRefresh.json())).toEqual(
        expect.objectContaining({ error: 'invalid_grant' }),
      );
      expect((await listTools(peer.tokens.access_token)).map(({ name }) => name)).toEqual(
        ALL_TOOL_NAMES,
      );
    },
  );
});

async function authorizeClient(clientId: OAuthClientId, redirectUri: string) {
  const code = `code-${crypto.randomUUID()}`;
  const { data: connectionId, error } = await admin.rpc('create_oauth_authorization_grant_v2', {
    p_user_id: userId,
    p_client_id: clientId,
    p_resource_uri: RESOURCE,
    p_scopes: [...ALL_SCOPES],
    p_code_hash: hashToken(code),
    p_redirect_uri: redirectUri,
    p_code_challenge: CHALLENGE,
    p_write_enabled: true,
  });
  if (error) throw error;
  if (!connectionId) throw new Error('OAuth grant did not return a connection');

  const response = await postToken(
    tokenRequest({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    }),
  );
  expect(response.status).toBe(200);
  const tokens = tokenResponseSchema.parse(await response.json());
  expect(new Set(tokens.scope.split(' '))).toEqual(new Set(ALL_SCOPES));

  return { connectionId, tokens };
}

function refreshClient(clientId: OAuthClientId, refreshToken: string) {
  return postToken(
    tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      resource: RESOURCE,
    }),
  );
}

function tokenRequest(form: Record<string, string>): NextRequest {
  const clientIp: Record<string, string> = {
    'claude-ai': '203.0.113.10',
    chatgpt: '203.0.113.11',
    cursor: '203.0.113.12',
  };
  return new NextRequest('https://app.dayopt.app/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-real-ip': clientIp[form.client_id ?? ''] ?? '203.0.113.254',
    },
    body: new URLSearchParams(form).toString(),
  });
}

async function listTools(accessToken: string): Promise<McpTool[]> {
  const response = await rawMcpRequest(accessToken, {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: 'tools/list',
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as unknown;
  if (!isObject(body) || !isObject(body.result) || !Array.isArray(body.result.tools)) {
    throw new Error('MCP tools/list response is invalid');
  }

  return body.result.tools.map((tool) => {
    if (
      !isObject(tool) ||
      typeof tool.name !== 'string' ||
      !isObject(tool.inputSchema) ||
      !isObject(tool.inputSchema.properties)
    ) {
      throw new Error('MCP tool descriptor is invalid');
    }
    return {
      name: tool.name,
      inputSchema: {
        properties: tool.inputSchema.properties,
      },
    };
  });
}

async function callTool(
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await callToolResult(accessToken, name, args);
  if (result.isError === true) {
    throw new Error(JSON.stringify(parseToolText(result)));
  }
  return result.structuredContent;
}

async function callToolResult(
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await rawMcpRequest(accessToken, {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: 'tools/call',
    params: { name, arguments: args },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as unknown;
  if (!isObject(body) || !isObject(body.result)) {
    throw new Error('MCP tools/call response is invalid');
  }
  return body.result;
}

function parseToolText(result: Record<string, unknown>): unknown {
  const content = Array.isArray(result.content) ? result.content[0] : null;
  if (!isObject(content) || content.type !== 'text' || typeof content.text !== 'string') {
    throw new Error('MCP tool error content is invalid');
  }
  return JSON.parse(content.text) as unknown;
}

function rawMcpRequest(accessToken: string, body: Record<string, unknown>) {
  return postMcp(
    new NextRequest('https://mcp.dayopt.app/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify(body),
    }),
  );
}

async function readMutationControl() {
  const { data, error } = await admin
    .from('mcp_mutation_control')
    .select('writes_enabled,enabled_client_ids,revision')
    .eq('singleton_key', true)
    .single();
  if (error) throw error;
  return data;
}

async function setMutationControl(writesEnabled: boolean): Promise<void> {
  const current = await readMutationControl();
  const { error } = await admin.rpc('set_mcp_mutation_control_v1', {
    p_writes_enabled: writesEnabled,
    p_expected_revision: current.revision,
  });
  if (error) throw error;
}

async function setClientWriteControl(clientId: OAuthClientId, enabled: boolean): Promise<void> {
  const current = await readMutationControl();
  const { error } = await admin.rpc('set_mcp_client_write_control_v1', {
    p_client_id: clientId,
    p_enabled: enabled,
    p_expected_revision: current.revision,
  });
  if (error) throw error;
}

function runOwnerSql(sql: string, variables: Record<string, string> = {}): void {
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
      input: sql,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) {
    throw new Error('Failed to restore the local MCP mutation control fixture');
  }
}

function forceMutationControlOffFixture(): void {
  runOwnerSql(`
    UPDATE public.mcp_mutation_control
    SET writes_enabled = false,
        revision = revision + 1,
        changed_at = pg_catalog.clock_timestamp()
    WHERE singleton_key = true;
  `);
}

function restoreMutationControlFixture(control: {
  writes_enabled: boolean;
  enabled_client_ids: string[];
}): void {
  if (control.writes_enabled) {
    throw new Error('MCP client beta fixture refuses to restore the global write gate ON');
  }

  runOwnerSql(
    `
      UPDATE public.mcp_mutation_control
      SET writes_enabled = false,
          enabled_client_ids = ARRAY(
            SELECT pg_catalog.jsonb_array_elements_text(:'enabled_client_ids'::JSONB)
          ),
          revision = revision + 1,
          changed_at = pg_catalog.clock_timestamp()
      WHERE singleton_key = true;
    `,
    { enabled_client_ids: JSON.stringify(control.enabled_client_ids) },
  );
}

type McpTool = {
  name: string;
  inputSchema: {
    properties: Record<string, unknown>;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
