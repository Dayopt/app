import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { NextRequest } from 'next/server';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as postMcp } from '@/app/api/mcp/route';
import type { Database } from '@/lib/database';
import { hashToken } from '@/lib/oauth-server';
import { derivePkceS256Challenge } from '@/lib/oauth-server/tokens';
import { appRouter } from '@/lib/trpc/root';

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
const email = `mcp-http-ui-race-${userId}@example.com`;
const password = 'test-password-123';
const resource = 'https://mcp.dayopt.app';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const challenge = derivePkceS256Challenge('v'.repeat(43));

let accessToken = '';

describe.skipIf(!RUN_LOCAL)('MCP HTTP and session tRPC races', () => {
  beforeAll(async () => {
    vi.stubEnv('MCP_WRITE_ENABLED_CLIENTS', 'chatgpt');

    const { error: createError } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw createError;

    const { error: profileError } = await admin
      .from('profiles')
      .update({ subscription_status: 'active' })
      .eq('id', userId);
    if (profileError) throw profileError;

    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    await setClientWriteControl(true);
    await setMutationControl(true);
    accessToken = await createWriteAccessToken();
  });

  afterAll(async () => {
    await setMutationControl(false);
    await setClientWriteControl(false);
    await userClient.auth.signOut();
    await admin.auth.admin.deleteUser(userId);
    vi.unstubAllEnvs();
  });

  it('creates non-conflicting Plan and Record through actual MCP HTTP', async () => {
    const planOperationId = crypto.randomUUID();
    const recordOperationId = crypto.randomUUID();
    const planAttempt = await callMcpTool('plans.create', {
      operationId: planOperationId,
      title: 'MCP HTTP control Plan',
      note: null,
      tagId: null,
      startAt: at(4 * 60 * 60_000),
      endAt: at(5 * 60 * 60_000),
    });
    const recordAttempt = await callMcpTool('records.create', {
      operationId: recordOperationId,
      title: 'MCP HTTP control Record',
      note: null,
      tagId: null,
      planId: null,
      startAt: at(-5 * 60 * 60_000),
      endAt: at(-4 * 60 * 60_000),
    });

    expect(planAttempt).toEqual({ success: true });
    expect(recordAttempt).toEqual({ success: true });
    expect(await receiptCount(planOperationId)).toBe(1);
    expect(await receiptCount(recordOperationId)).toBe(1);
  });

  it('allows only one Plan create through actual MCP HTTP or session tRPC', async () => {
    const startAt = at(60 * 60_000);
    const endAt = at(2 * 60 * 60_000);
    const operationId = crypto.randomUUID();

    const [mcpAttempt, uiAttempt] = await raceBehindUserWriteBoundary([
      () =>
        callMcpTool('plans.create', {
          operationId,
          title: 'MCP HTTP Plan',
          note: null,
          tagId: null,
          startAt,
          endAt,
        }),
      () =>
        callUi(() =>
          createUiCaller().plans.create({
            title: 'Session tRPC Plan',
            note: null,
            tagId: null,
            start_at: startAt,
            end_at: endAt,
          }),
        ),
    ]);

    expect([mcpAttempt, uiAttempt].filter(({ success }) => success)).toHaveLength(1);
    expect([mcpAttempt, uiAttempt].filter(({ success }) => !success)).toHaveLength(1);
    expect(mcpAttempt.success ? uiAttempt.code : mcpAttempt.code).toBe(
      mcpAttempt.success ? 'BAD_REQUEST' : 'TIME_OVERLAP',
    );

    const { count } = await admin
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('start_at', startAt)
      .lte('start_at', startAt);
    expect(count).toBe(1);
    expect(await receiptCount(operationId)).toBe(mcpAttempt.success ? 1 : 0);
  });

  it('allows only one Record create through actual MCP HTTP or session tRPC', async () => {
    const startAt = at(-2 * 60 * 60_000);
    const endAt = at(-60 * 60_000);
    const operationId = crypto.randomUUID();

    const [mcpAttempt, uiAttempt] = await raceBehindUserWriteBoundary([
      () =>
        callMcpTool('records.create', {
          operationId,
          title: 'MCP HTTP Record',
          note: null,
          tagId: null,
          planId: null,
          startAt,
          endAt,
        }),
      () =>
        callUi(() =>
          createUiCaller().records.create({
            title: 'Session tRPC Record',
            note: null,
            tagId: null,
            planId: null,
            start_at: startAt,
            end_at: endAt,
          }),
        ),
    ]);

    expect([mcpAttempt, uiAttempt].filter(({ success }) => success)).toHaveLength(1);
    expect([mcpAttempt, uiAttempt].filter(({ success }) => !success)).toHaveLength(1);
    expect(mcpAttempt.success ? uiAttempt.code : mcpAttempt.code).toBe(
      mcpAttempt.success ? 'BAD_REQUEST' : 'TIME_OVERLAP',
    );

    const { count } = await admin
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('start_at', startAt)
      .lte('start_at', startAt);
    expect(count).toBe(1);
    expect(await receiptCount(operationId)).toBe(mcpAttempt.success ? 1 : 0);
  });
});

function createUiCaller() {
  return appRouter.createCaller({
    req: { headers: {}, cookies: {} },
    res: {},
    userId,
    supabase: userClient,
    authMode: 'session',
  });
}

async function callUi(run: () => Promise<unknown>): Promise<AttemptResult> {
  try {
    await run();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      code: isRecord(error) && typeof error.code === 'string' ? error.code : 'UNKNOWN',
    };
  }
}

async function callMcpTool(name: string, args: Record<string, unknown>): Promise<AttemptResult> {
  const response = await postMcp(
    new NextRequest('https://mcp.dayopt.app/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    }),
  );
  if (!response.ok) return { success: false, code: `HTTP_${response.status}` };

  const body = (await response.json()) as unknown;
  if (!isRecord(body) || !isRecord(body.result)) {
    return { success: false, code: 'INVALID_MCP_RESPONSE' };
  }
  if (body.result.isError !== true) return { success: true };

  const content = Array.isArray(body.result.content) ? body.result.content[0] : null;
  if (!isRecord(content) || content.type !== 'text' || typeof content.text !== 'string') {
    return { success: false, code: 'MCP_ERROR' };
  }
  try {
    const errorBody = JSON.parse(content.text) as unknown;
    const code =
      isRecord(errorBody) && isRecord(errorBody.error) && typeof errorBody.error.code === 'string'
        ? errorBody.error.code
        : 'MCP_ERROR';
    return { success: false, code };
  } catch {
    return { success: false, code: 'MCP_ERROR' };
  }
}

interface AttemptResult {
  success: boolean;
  code?: string;
}

async function raceBehindUserWriteBoundary(
  startAttempts: [() => Promise<AttemptResult>, () => Promise<AttemptResult>],
): Promise<[AttemptResult, AttemptResult]> {
  const holder = await holdUserWriteBoundary();
  const results = Promise.all([startAttempts[0](), startAttempts[1]()]);
  try {
    await waitForUserWriteWaiters(2);
    await holder.release();
    return await results;
  } catch (error) {
    await holder.release(false);
    await results.catch(() => undefined);
    throw error;
  }
}

function psqlArgs(variables: Record<string, string> = {}): string[] {
  return [
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
  ];
}

function psqlEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: 'postgres' };
}

async function holdUserWriteBoundary(): Promise<{
  release: (commit?: boolean) => Promise<void>;
}> {
  const child = spawn('psql', psqlArgs({ user_id: userId }), { env: psqlEnv() });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.write(
    `BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'dayopt:timeblock-user-write:' || :'user_id',
    6182714039157042
  )
);
SELECT 'LOCKED';
`,
  );

  const deadline = Date.now() + 5_000;
  while (!stdout.includes('LOCKED')) {
    if (child.exitCode !== null) throw new Error(`User lock holder exited: ${stderr}`);
    if (Date.now() >= deadline) throw new Error(`Timed out acquiring user lock: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return {
    release: async (commit = true) => {
      if (child.exitCode !== null) return;
      child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
      await once(child, 'close');
    },
  };
}

async function waitForUserWriteWaiters(expectedCount: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiterCount = await countUserWriteWaiters();
    if (waiterCount >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expectedCount} user write requests`);
}

async function countUserWriteWaiters(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      [
        ...psqlArgs(),
        '-c',
        `WITH expected AS (
  SELECT pg_catalog.hashtextextended(
    'dayopt:timeblock-user-write:${userId}',
    6182714039157042
  ) AS lock_key
)
SELECT pg_catalog.count(*)
FROM pg_catalog.pg_locks AS candidate
CROSS JOIN expected
WHERE candidate.locktype = 'advisory'
  AND NOT candidate.granted
  AND candidate.objsubid = 1
  AND candidate.classid::BIGINT = ((expected.lock_key >> 32) & 4294967295)
  AND candidate.objid::BIGINT = (expected.lock_key & 4294967295)`,
      ],
      { env: psqlEnv() },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      if (code === 0) resolve(Number(stdout.trim()));
      else reject(new Error(stderr));
    });
  });
}

async function readMutationControl() {
  const { data, error } = await admin
    .from('mcp_mutation_control')
    .select('writes_enabled, revision')
    .eq('singleton_key', true)
    .single();
  if (error) throw error;
  return data;
}

async function setMutationControl(writesEnabled: boolean) {
  const current = await readMutationControl();
  const { error } = await admin.rpc('set_mcp_mutation_control_v1', {
    p_writes_enabled: writesEnabled,
    p_expected_revision: current.revision,
  });
  if (error) throw error;
}

async function setClientWriteControl(enabled: boolean) {
  const current = await readMutationControl();
  const { error } = await admin.rpc('set_mcp_client_write_control_v1', {
    p_client_id: 'chatgpt',
    p_enabled: enabled,
    p_expected_revision: current.revision,
  });
  if (error) throw error;
}

async function createWriteAccessToken(): Promise<string> {
  const code = `code-${crypto.randomUUID()}`;
  const token = `dop_at_${crypto.randomUUID()}`;
  const { error: grantError } = await admin.rpc('create_oauth_authorization_grant_v2', {
    p_user_id: userId,
    p_client_id: 'chatgpt',
    p_resource_uri: resource,
    p_scopes: ['read:entries', 'write:plans', 'write:records'],
    p_code_hash: hashToken(code),
    p_redirect_uri: redirectUri,
    p_code_challenge: challenge,
    p_write_enabled: true,
  });
  if (grantError) throw grantError;

  const { error: exchangeError } = await admin.rpc('exchange_oauth_authorization_code_v2', {
    p_code_hash: hashToken(code),
    p_client_id: 'chatgpt',
    p_redirect_uri: redirectUri,
    p_resource_uri: resource,
    p_code_challenge: challenge,
    p_refresh_hash: hashToken(`dop_rt_${crypto.randomUUID()}`),
    p_access_hash: hashToken(token),
  });
  if (exchangeError) throw exchangeError;
  return token;
}

async function receiptCount(operationId: string): Promise<number> {
  const { count, error } = await admin
    .from('mcp_mutation_receipts')
    .select('operation_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('operation_id', operationId);
  if (error) throw error;
  return count ?? 0;
}

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
