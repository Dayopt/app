import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';
const LOCAL_DATABASE_URL = [
  'postgresql://postgres',
  ':',
  'postgres',
  '@127.0.0.1:54322/postgres',
].join('');
const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();

function runSql(sql: string): string {
  return execFileSync('psql', [DATABASE_URL, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
    encoding: 'utf8',
    input: sql,
  }).trim();
}

function psqlArgs(): string[] {
  return [DATABASE_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
}

function psqlEnv(applicationName?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(applicationName ? { PGAPPNAME: applicationName } : {}),
  };
}

async function runSqlAsync(sql: string, applicationName?: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('psql', psqlArgs(), { env: psqlEnv(applicationName) });
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
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim()));
    });
    child.stdin.end(sql);
  });
}

async function holdTransaction(
  sql: string,
  options: { serviceRole?: boolean } = {},
): Promise<{
  execute: (nextSql: string) => Promise<void>;
  release: (commit?: boolean) => Promise<void>;
}> {
  const child = spawn('psql', psqlArgs(), { env: psqlEnv() });
  let stdout = '';
  let stderr = '';
  let markerSequence = 0;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.write(`
BEGIN;
${
  options.serviceRole
    ? `SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';`
    : ''
}
${sql}
SELECT 'LOCKED';
`);

  async function waitForMarker(marker: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!stdout.includes(marker)) {
      if (child.exitCode !== null) throw new Error(`Lock holder exited: ${stderr}`);
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${marker}: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  await waitForMarker('LOCKED');

  return {
    execute: async (nextSql: string) => {
      const marker = `STEP_${markerSequence++}`;
      child.stdin.write(`
${nextSql}
SELECT '${marker}';
`);
      await waitForMarker(marker);
    },
    release: async (commit = true) => {
      if (child.exitCode !== null) return;
      child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
      await once(child, 'close');
    },
  };
}

async function waitForAdvisoryWaiter(lockIdentity: string, minimumWaiters = 1): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiterCount = Number(
      runSql(`
WITH expected AS (
  SELECT pg_catalog.hashtextextended(
    '${lockIdentity}',
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
  AND candidate.objid::BIGINT = (expected.lock_key & 4294967295);
`),
    );
    if (waiterCount >= minimumWaiters) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for advisory lock: ${lockIdentity}`);
}

async function waitForApplicationLock(applicationName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiting = runSql(`
SELECT pg_catalog.count(*) > 0
FROM pg_catalog.pg_stat_activity
WHERE application_name = '${applicationName}'
  AND wait_event_type = 'Lock';
`);
    if (waiting === 't') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for application lock: ${applicationName}`);
}

function runServiceRoleSql(sql: string): string {
  return runSql(`
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
${sql}
COMMIT;
`);
}

function createUser(userId: string, timezone = 'UTC'): void {
  runSql(`
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  email_change_confirm_status
) VALUES (
  '${userId}',
  '00000000-0000-0000-0000-000000000000',
  'revision-${userId}@example.com',
  crypt('test-password-123', gen_salt('bf')),
  pg_catalog.now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  pg_catalog.now(),
  pg_catalog.now(),
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  '',
  '',
  NULL,
  NULL,
  '',
  '',
  0
);

INSERT INTO public.user_settings (user_id, timezone)
VALUES ('${userId}', '${timezone}');
`);
}

function setMcpMutationControl(enabled: boolean): void {
  runSql(`
UPDATE public.mcp_mutation_control
SET
  writes_enabled = ${enabled},
  enabled_client_ids = ${enabled ? "ARRAY['chatgpt']::TEXT[]" : 'ARRAY[]::TEXT[]'},
  revision = revision + 1,
  changed_at = pg_catalog.clock_timestamp()
WHERE singleton_key = true;
`);
}

function createMcpWriteAuthorization(userId: string): {
  accessTokenId: string;
  connectionId: string;
} {
  const connectionId = crypto.randomUUID();
  const accessTokenId = crypto.randomUUID();
  runSql(`
UPDATE public.profiles
SET subscription_status = 'active'
WHERE id = '${userId}';

INSERT INTO public.oauth_connections (
  id,
  user_id,
  client_id,
  resource_uri,
  scopes,
  reauth_required_at,
  write_enabled_at
)
VALUES (
  '${connectionId}',
  '${userId}',
  'chatgpt',
  'https://mcp.dayopt.app',
  ARRAY['read:entries', 'write:plans']::TEXT[],
  pg_catalog.clock_timestamp() + INTERVAL '90 days',
  pg_catalog.clock_timestamp()
);

INSERT INTO public.oauth_tokens (
  id,
  user_id,
  token_hash,
  token_type,
  client_id,
  scopes,
  expires_at,
  connection_id,
  resource_uri
)
VALUES (
  '${accessTokenId}',
  '${userId}',
  'step5-${accessTokenId}',
  'access',
  'chatgpt',
  ARRAY['read:entries', 'write:plans']::TEXT[],
  pg_catalog.clock_timestamp() + INTERVAL '1 hour',
  '${connectionId}',
  'https://mcp.dayopt.app'
);
`);
  return { accessTokenId, connectionId };
}

function readRevision(userId: string): bigint {
  return BigInt(
    runServiceRoleSql(`
SELECT revision
FROM public.get_timeblock_context_marker_v1('${userId}');
`),
  );
}

function createPlan(userId: string, title: string, hourOffset: number): [string, string] {
  const result = runServiceRoleSql(`
SELECT id::TEXT || '|' || updated_at::TEXT
FROM public.create_plan_command_v1(
  '${userId}',
  '${title}',
  NULL,
  NULL,
  NULL,
  'manual',
  '2030-01-01T00:00:00Z'::TIMESTAMPTZ + INTERVAL '${hourOffset} hours',
  '2030-01-01T01:00:00Z'::TIMESTAMPTZ + INTERVAL '${hourOffset} hours'
);
`);
  const [id, updatedAt] = result.split('|');
  if (!id || !updatedAt) throw new Error('Plan command did not return its version');
  return [id, updatedAt];
}

function createRecord(userId: string, title: string, hourOffset: number): [string, string] {
  const result = runServiceRoleSql(`
SELECT id::TEXT || '|' || updated_at::TEXT
FROM public.create_record_command_v1(
  '${userId}',
  '${title}',
  NULL,
  NULL,
  NULL,
  NULL,
  'manual',
  '2020-01-01T00:00:00Z'::TIMESTAMPTZ + INTERVAL '${hourOffset} hours',
  '2020-01-01T01:00:00Z'::TIMESTAMPTZ + INTERVAL '${hourOffset} hours'
);
`);
  const [id, updatedAt] = result.split('|');
  if (!id || !updatedAt) throw new Error('Record command did not return its version');
  return [id, updatedAt];
}

describe.skipIf(!RUN_LOCAL)('timeblock user revision boundary', () => {
  beforeAll(() => {
    createUser(USER_A, 'Asia/Tokyo');
    createUser(USER_B, 'America/New_York');
  });

  afterEach(() => {
    runSql(`
DELETE FROM public.records WHERE user_id IN ('${USER_A}', '${USER_B}');
DELETE FROM public.plans WHERE user_id IN ('${USER_A}', '${USER_B}');
DELETE FROM public.tags WHERE user_id IN ('${USER_A}', '${USER_B}');
`);
  });

  afterAll(() => {
    runSql(`DELETE FROM auth.users WHERE id = '${USER_A}';`);
    runSql(`DELETE FROM auth.users WHERE id = '${USER_B}';`);
  });

  it('markerとprivate transaction stateはservice-role境界を越えて公開しない', () => {
    const markerUser = crypto.randomUUID();
    createUser(markerUser, 'Asia/Tokyo');

    const marker = runServiceRoleSql(`
SELECT revision || '|' || timezone || '|' || (database_now IS NOT NULL)::TEXT
FROM public.get_timeblock_context_marker_v1('${markerUser}');
`);
    expect(marker).toBe('0|Asia/Tokyo|true');

    const authenticatedDenied = runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"role":"authenticated","sub":"${markerUser}"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.get_timeblock_context_marker_v1('${markerUser}');
    RAISE EXCEPTION 'authenticated marker call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
ROLLBACK;
SELECT 'denied';
    `);
    expect(authenticatedDenied).toBe('denied');

    const anonDenied = runSql(`
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_timeblock_context_marker_v1('${markerUser}');
    RAISE EXCEPTION 'anon marker call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
ROLLBACK;
SELECT 'denied';
`);
    expect(anonDenied).toBe('denied');

    const privateStateDenied = runSql(`
BEGIN;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM private.timeblock_user_revisions LIMIT 1;
    RAISE EXCEPTION 'private revision read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM 1 FROM private.timeblock_transaction_states LIMIT 1;
    RAISE EXCEPTION 'private state read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    INSERT INTO private.timeblock_transaction_revision_bumps (
      backend_pid,
      transaction_id,
      user_id
    )
    VALUES (
      pg_catalog.pg_backend_pid(),
      pg_catalog.pg_current_xact_id(),
      '${markerUser}'
    );
    RAISE EXCEPTION 'private bump write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
ROLLBACK;
SELECT 'denied';
`);
    expect(privateStateDenied).toBe('denied');

    runSql(`DELETE FROM auth.users WHERE id = '${markerUser}';`);
  });

  it('PlanとRecordのcommitだけrevisionを進め、rollbackでは維持する', () => {
    let revision = readRevision(USER_A);
    const [planId, planVersion] = createPlan(USER_A, 'Revision Plan', 0);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    const updatedPlanVersion = runServiceRoleSql(`
SELECT updated_at::TEXT
FROM public.update_plan_command_v1(
  '${USER_A}',
  '${planId}',
  '${planVersion}',
  'Updated Revision Plan',
  NULL,
  NULL,
  NULL,
  '2030-01-01T00:00:00Z',
  '2030-01-01T01:00:00Z'
);
`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    runSql(`
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
UPDATE public.plans SET note = 'rolled back' WHERE id = '${planId}';
ROLLBACK;
`);
    expect(readRevision(USER_A)).toBe(revision);

    revision = readRevision(USER_A);
    const deletedPlanVersion = runServiceRoleSql(`
SELECT updated_at::TEXT
FROM public.delete_plan_command_v1('${USER_A}', '${planId}', '${updatedPlanVersion}');
`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    runServiceRoleSql(`
SELECT id
FROM public.restore_plan_command_v1('${USER_A}', '${planId}', '${deletedPlanVersion}');
`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    runServiceRoleSql(`DELETE FROM public.plans WHERE id = '${planId}';`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    const [recordId, recordVersion] = createRecord(USER_A, 'Revision Record', 0);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    const updatedRecordVersion = runServiceRoleSql(`
SELECT updated_at::TEXT
FROM public.update_record_command_v1(
  '${USER_A}',
  '${recordId}',
  '${recordVersion}',
  'Updated Revision Record',
  NULL,
  NULL,
  NULL,
  NULL,
  '2020-01-01T00:00:00Z',
  '2020-01-01T01:00:00Z'
);
`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    const deletedRecordVersion = runServiceRoleSql(`
SELECT updated_at::TEXT
FROM public.delete_record_command_v1('${USER_A}', '${recordId}', '${updatedRecordVersion}');
`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    runServiceRoleSql(`
SELECT id
FROM public.restore_record_command_v1('${USER_A}', '${recordId}', '${deletedRecordVersion}');
`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);

    revision = readRevision(USER_A);
    runServiceRoleSql(`DELETE FROM public.records WHERE id = '${recordId}';`);
    expect(readRevision(USER_A)).toBeGreaterThan(revision);
  });

  it('skip、confirm-day、Record detach、tag reassign、purgeを同じrevision契約で扱う', () => {
    const planIdentity = runServiceRoleSql(`
SELECT
  id::TEXT
  || '|' || updated_at::TEXT
  || '|' || start_at::TEXT
  || '|' || end_at::TEXT
FROM public.create_plan_command_v1(
  '${USER_A}',
  'Revision lifecycle Plan',
  NULL,
  NULL,
  NULL,
  'manual',
  pg_catalog.clock_timestamp() - INTERVAL '1 second',
  pg_catalog.clock_timestamp() + INTERVAL '1500 milliseconds'
);
`);
    const [planId, planVersion, planStartAt, planEndAt] = planIdentity.split('|');
    if (!planId || !planVersion || !planStartAt || !planEndAt) {
      throw new Error('Lifecycle Plan identity is missing');
    }
    runSql(`SELECT pg_catalog.pg_sleep(1.7);`);
    let revision = readRevision(USER_A);

    const skippedVersion = runServiceRoleSql(`
SELECT updated_at::TEXT
FROM public.set_plan_skipped_command_v1(
  '${USER_A}',
  '${planId}',
  '${planVersion}',
  true
);
`);
    expect(readRevision(USER_A)).toBe(revision + 1n);

    revision = readRevision(USER_A);
    const unskippedVersion = runServiceRoleSql(`
SELECT updated_at::TEXT
FROM public.set_plan_skipped_command_v1(
  '${USER_A}',
  '${planId}',
  '${skippedVersion}',
  false
);
`);
    expect(readRevision(USER_A)).toBe(revision + 1n);

    revision = readRevision(USER_A);
    runServiceRoleSql(`
DO $$
BEGIN
  BEGIN
    PERFORM public.update_plan_command_v1(
      '${USER_A}',
      '${planId}',
      '2000-01-01T00:00:00Z',
      'Stale update',
      NULL,
      NULL,
      NULL,
      '${planStartAt}',
      '${planEndAt}'
    );
    RAISE EXCEPTION 'stale CAS unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'DT002' THEN
    NULL;
  END;
END;
$$;
`);
    expect(readRevision(USER_A)).toBe(revision);

    revision = readRevision(USER_A);
    runServiceRoleSql(`
SELECT id
FROM public.confirm_day_plans_command_v1(
  '${USER_A}',
  '${planStartAt}'::TIMESTAMPTZ - INTERVAL '1 hour',
  '${planEndAt}'::TIMESTAMPTZ + INTERVAL '1 hour',
  pg_catalog.clock_timestamp()
);
`);
    expect(readRevision(USER_A)).toBe(revision + 1n);

    const recordIdentity = runSql(`
SELECT id::TEXT || '|' || updated_at::TEXT
FROM public.records
WHERE user_id = '${USER_A}'
  AND plan_id = '${planId}';
`);
    const [recordId] = recordIdentity.split('|');
    if (!recordId) throw new Error('Confirmed Record identity is missing');

    revision = readRevision(USER_A);
    const detachableRecordIdentity = runServiceRoleSql(`
SELECT id::TEXT || '|' || updated_at::TEXT
FROM public.create_record_command_v1(
  '${USER_A}',
  'Detachable API Record',
  NULL,
  NULL,
  '${planId}',
  NULL,
  'api',
  '${planStartAt}'::TIMESTAMPTZ - INTERVAL '3 hours',
  '${planStartAt}'::TIMESTAMPTZ - INTERVAL '2 hours'
);
`);
    expect(readRevision(USER_A)).toBe(revision + 1n);
    const [detachableRecordId, detachableRecordVersion] = detachableRecordIdentity.split('|');
    if (!detachableRecordId || !detachableRecordVersion) {
      throw new Error('Detachable Record identity is missing');
    }

    revision = readRevision(USER_A);
    runServiceRoleSql(`
SELECT id
FROM public.update_record_command_v1(
  '${USER_A}',
  '${detachableRecordId}',
  '${detachableRecordVersion}',
  'Detached API Record',
  NULL,
  NULL,
  NULL,
  NULL,
  '${planStartAt}'::TIMESTAMPTZ - INTERVAL '3 hours',
  '${planStartAt}'::TIMESTAMPTZ - INTERVAL '2 hours'
);
`);
    expect(readRevision(USER_A)).toBe(revision + 1n);
    expect(
      runSql(
        `SELECT (plan_id IS NULL)::TEXT FROM public.records WHERE id = '${detachableRecordId}';`,
      ),
    ).toBe('true');

    const sourceTagId = crypto.randomUUID();
    const targetTagId = crypto.randomUUID();
    runSql(`
INSERT INTO public.tags (id, user_id, name, sort_order)
VALUES
  ('${sourceTagId}', '${USER_A}', 'Revision source', 0),
  ('${targetTagId}', '${USER_A}', 'Revision target', 1);
UPDATE public.plans SET tag_id = '${sourceTagId}' WHERE id = '${planId}';
UPDATE public.records SET tag_id = '${sourceTagId}' WHERE id = '${recordId}';
`);

    revision = readRevision(USER_A);
    runServiceRoleSql(`
SELECT public.delete_tags_with_timeblocks_command_v3(
  '${USER_A}',
  ARRAY['${sourceTagId}'::UUID],
  'reassign',
  '${targetTagId}',
  false
);
`);
    expect(readRevision(USER_A)).toBe(revision + 1n);
    expect(
      runSql(`
SELECT
  (SELECT tag_id = '${targetTagId}' FROM public.plans WHERE id = '${planId}')
  AND
  (SELECT tag_id = '${targetTagId}' FROM public.records WHERE id = '${recordId}');
`),
    ).toBe('t');

    revision = readRevision(USER_A);
    runServiceRoleSql(`SELECT public.delete_user_timeblocks_command_v2('${USER_A}');`);
    expect(readRevision(USER_A)).toBe(revision + 1n);
    expect(
      runSql(`
SELECT
  (SELECT pg_catalog.count(*) FROM public.plans WHERE user_id = '${USER_A}')
  + (SELECT pg_catalog.count(*) FROM public.records WHERE user_id = '${USER_A}');
`),
    ).toBe('0');

    expect(unskippedVersion).not.toBe('');
  });

  it('Settings deleteAllDataはPlanとRecordを削除してrevisionを一度だけ進める', () => {
    createPlan(USER_A, 'Delete all Plan', 19);
    createRecord(USER_A, 'Delete all Record', 19);
    runSql(`
INSERT INTO public.tags (user_id, name, sort_order)
VALUES ('${USER_A}', 'Delete all tag', 0);
`);
    const revision = readRevision(USER_A);

    expect(
      runServiceRoleSql(`SELECT public.delete_all_user_data_command_v2('${USER_A}')::TEXT;`),
    ).toBe('true');
    expect(readRevision(USER_A)).toBe(revision + 1n);
    expect(
      runSql(`
SELECT
  (SELECT pg_catalog.count(*) FROM public.plans WHERE user_id = '${USER_A}')
  + (SELECT pg_catalog.count(*) FROM public.records WHERE user_id = '${USER_A}')
  + (SELECT pg_catalog.count(*) FROM public.tags WHERE user_id = '${USER_A}')
  + (SELECT pg_catalog.count(*) FROM public.user_settings WHERE user_id = '${USER_A}');
`),
    ).toBe('0');

    runSql(`
INSERT INTO public.user_settings (user_id, timezone)
VALUES ('${USER_A}', 'Asia/Tokyo');
`);
  });

  it('supported transactionはuserとwriter modeの混在をrow変更前に拒否する', () => {
    const [planB] = createPlan(USER_B, 'Bound user B', 8);
    const supportedTitle = `Supported A ${crypto.randomUUID()}`;
    const rejectedTitle = `Rejected B ${crypto.randomUUID()}`;

    runServiceRoleSql(`
SELECT id
FROM public.create_plan_command_v1(
  '${USER_A}',
  '${supportedTitle}',
  NULL,
  NULL,
  NULL,
  'manual',
  '2030-01-02T00:00:00Z',
  '2030-01-02T01:00:00Z'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.create_plan_command_v1(
      '${USER_B}',
      '${rejectedTitle}',
      NULL,
      NULL,
      NULL,
      'manual',
      '2030-01-02T02:00:00Z',
      '2030-01-02T03:00:00Z'
    );
    RAISE EXCEPTION 'mixed supported users unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    UPDATE public.plans
    SET note = 'mixed direct user'
    WHERE id = '${planB}';
    RAISE EXCEPTION 'supported-to-direct mixed user unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;
`);

    expect(
      runSql(`
SELECT pg_catalog.count(*)
FROM public.plans
WHERE user_id = '${USER_A}'
  AND title = '${supportedTitle}';
`),
    ).toBe('1');
    expect(
      runSql(`
SELECT pg_catalog.count(*)
FROM public.plans
WHERE user_id = '${USER_B}'
  AND title = '${rejectedTitle}';
`),
    ).toBe('0');
    expect(runSql(`SELECT COALESCE(note, '') FROM public.plans WHERE id = '${planB}';`)).toBe('');

    const directTitle = `Direct then supported ${crypto.randomUUID()}`;
    runServiceRoleSql(`
UPDATE public.plans
SET note = 'direct mode committed'
WHERE id = '${planB}';

DO $$
BEGIN
  BEGIN
    PERFORM public.create_plan_command_v1(
      '${USER_A}',
      '${directTitle}',
      NULL,
      NULL,
      NULL,
      'manual',
      '2030-01-02T04:00:00Z',
      '2030-01-02T05:00:00Z'
    );
    RAISE EXCEPTION 'direct-to-supported mode change unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;
`);

    expect(runSql(`SELECT note FROM public.plans WHERE id = '${planB}';`)).toBe(
      'direct mode committed',
    );
    expect(
      runSql(`
SELECT pg_catalog.count(*)
FROM public.plans
WHERE user_id = '${USER_A}'
  AND title = '${directTitle}';
`),
    ).toBe('0');
  });

  it('invalid A→BとB→A transactionはuser advisory lock前にfail-fastする', async () => {
    const holderA = await holdTransaction(
      `SELECT public.delete_user_timeblocks_command_v2('${USER_A}');`,
      { serviceRole: true },
    );
    const holderB = await holdTransaction(
      `SELECT public.delete_user_timeblocks_command_v2('${USER_B}');`,
      { serviceRole: true },
    );
    const crossAttempts = Promise.all([
      holderA.execute(`
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_user_timeblocks_command_v2('${USER_B}');
    RAISE EXCEPTION 'A to B unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;
`),
      holderB.execute(`
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_user_timeblocks_command_v2('${USER_A}');
    RAISE EXCEPTION 'B to A unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;
`),
    ]);
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        crossAttempts,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Mixed-user transactions did not fail fast')),
            2_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      await holderA.release(false);
      await holderB.release(false);
      await crossAttempts.catch(() => undefined);
    }
  });

  it('同一userのshared→exclusive upgradeは待機中writerとのdeadlock前に拒否する', async () => {
    const holder = await holdTransaction(
      `
SELECT id
FROM public.create_plan_command_v1(
  '${USER_A}',
  'Shared lock holder',
  NULL,
  NULL,
  NULL,
  'manual',
  '2030-01-02T10:00:00Z',
  '2030-01-02T11:00:00Z'
);
`,
      { serviceRole: true },
    );
    const waitingWriter = runSqlAsync(
      `
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SELECT id
FROM public.create_plan_command_v1(
  '${USER_A}',
  'Waiting shared writer',
  NULL,
  NULL,
  NULL,
  'manual',
  '2030-01-02T12:00:00Z',
  '2030-01-02T13:00:00Z'
);
COMMIT;
`,
      'step5-shared-lock-waiter',
    );

    try {
      await waitForApplicationLock('step5-shared-lock-waiter');
      await holder.execute(`
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_user_timeblocks_command_v2('${USER_A}');
    RAISE EXCEPTION 'shared-to-exclusive upgrade unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
END;
$$;
`);
      await holder.release();
      await waitingWriter;
    } finally {
      await holder.release(false);
      await waitingWriter.catch(() => undefined);
    }

    expect(
      runSql(`
SELECT pg_catalog.count(*)
FROM public.plans
WHERE user_id = '${USER_A}'
  AND title = 'Waiting shared writer';
`),
    ).toBe('1');
  });

  it('同一userのexclusive→shared compositionは一つのtransactionとして完了する', () => {
    createPlan(USER_A, 'Exclusive then shared seed', 20);
    const revision = readRevision(USER_A);

    runServiceRoleSql(`
SELECT public.delete_user_timeblocks_command_v2('${USER_A}');
SELECT id
FROM public.create_plan_command_v1(
  '${USER_A}',
  'Exclusive then shared result',
  NULL,
  NULL,
  NULL,
  'manual',
  '2030-01-03T04:00:00Z',
  '2030-01-03T05:00:00Z'
);
`);

    expect(readRevision(USER_A)).toBe(revision + 1n);
    expect(
      runSql(`
SELECT pg_catalog.count(*)
FROM public.plans
WHERE user_id = '${USER_A}'
  AND title = 'Exclusive then shared result';
`),
    ).toBe('1');
  });

  it('MCP replay、authority expiry、domain errorはrevisionを進めない', () => {
    const mcpUserId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    createUser(mcpUserId);

    try {
      setMcpMutationControl(true);
      const authorization = createMcpWriteAuthorization(mcpUserId);
      let revision = readRevision(mcpUserId);
      const applySql = `
SELECT replayed::TEXT
FROM public.apply_mcp_plan_create_v1(
  '${authorization.connectionId}',
  '${authorization.accessTokenId}',
  '${operationId}',
  'Revision MCP Plan',
  NULL,
  NULL,
  '2035-01-01T00:00:00Z',
  '2035-01-01T01:00:00Z'
);
`;

      expect(runServiceRoleSql(applySql)).toBe('false');
      expect(readRevision(mcpUserId)).toBe(revision + 1n);

      revision = readRevision(mcpUserId);
      expect(runServiceRoleSql(applySql)).toBe('true');
      expect(readRevision(mcpUserId)).toBe(revision);

      runSql(`
UPDATE public.oauth_tokens
SET expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 second'
WHERE id = '${authorization.accessTokenId}';
`);
      runServiceRoleSql(`
DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.apply_mcp_plan_create_v1(
      '${authorization.connectionId}',
      '${authorization.accessTokenId}',
      '${crypto.randomUUID()}',
      'Expired authority',
      NULL,
      NULL,
      '2035-01-01T02:00:00Z',
      '2035-01-01T03:00:00Z'
    );
    RAISE EXCEPTION 'expired authority unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'DM004' THEN
    NULL;
  END;
END;
$$;
`);
      expect(readRevision(mcpUserId)).toBe(revision);

      runSql(`
UPDATE public.oauth_tokens
SET expires_at = pg_catalog.clock_timestamp() + INTERVAL '1 hour'
WHERE id = '${authorization.accessTokenId}';
`);
      runServiceRoleSql(`
DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.apply_mcp_plan_create_v1(
      '${authorization.connectionId}',
      '${authorization.accessTokenId}',
      '${crypto.randomUUID()}',
      'Invalid past Plan',
      NULL,
      NULL,
      '2020-01-01T00:00:00Z',
      '2020-01-01T01:00:00Z'
    );
    RAISE EXCEPTION 'invalid domain write unexpectedly succeeded'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'DT004' THEN
    NULL;
  END;
END;
$$;
`);
      expect(readRevision(mcpUserId)).toBe(revision);
    } finally {
      runSql(`DELETE FROM auth.users WHERE id = '${mcpUserId}';`);
      setMcpMutationControl(false);
    }
  });

  it('connection確認後にaccount削除がcommitしてもMCP authorization lossをDM004で返す', async () => {
    const raceUserId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    createUser(raceUserId);
    setMcpMutationControl(true);
    const authorizationFixture = createMcpWriteAuthorization(raceUserId);

    let globalHolder: Awaited<ReturnType<typeof holdTransaction>> | undefined;
    let authorization: Promise<string> | undefined;
    let deletion: Promise<string> | undefined;

    try {
      globalHolder = await holdTransaction(
        `
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'dayopt:timeblock-global-direct-write',
    6182714039157042
  )
);
`,
      );
      authorization = runSqlAsync(
        `
DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM private.authorize_mcp_mutation_v1(
      '${authorizationFixture.connectionId}',
      '${authorizationFixture.accessTokenId}',
      'write:plans',
      '${operationId}'
    );
    RAISE EXCEPTION 'authorization unexpectedly survived account deletion'
      USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'DM004' THEN
    NULL;
  END;
END;
$$;
SELECT 'authorization-lost';
`,
        'step5-mcp-authorization-race',
      );
      await waitForAdvisoryWaiter('dayopt:timeblock-global-direct-write');
      deletion = runSqlAsync(
        `
DELETE FROM auth.users
WHERE id = '${raceUserId}';
SELECT 'account-deleted';
`,
        'step5-account-delete-race',
      );
      await waitForAdvisoryWaiter('dayopt:timeblock-global-direct-write', 2);
      await globalHolder.release();

      await expect(authorization).resolves.toBe('authorization-lost');
      await expect(deletion).resolves.toBe('account-deleted');
    } finally {
      await globalHolder?.release(false);
      await authorization?.catch(() => undefined);
      await deletion?.catch(() => undefined);
      runSql(`DELETE FROM auth.users WHERE id = '${raceUserId}';`);
      setMcpMutationControl(false);
    }
  });

  it('callerがGUCを偽装してもdirect writeはglobal boundaryを迂回しない', async () => {
    const [planB] = createPlan(USER_B, 'Forged GUC target', 10);
    const holder = await holdTransaction(
      `
SELECT id
FROM public.create_plan_command_v1(
  '${USER_A}',
  'Supported lock holder',
  NULL,
  NULL,
  NULL,
  'manual',
  '2030-01-03T00:00:00Z',
  '2030-01-03T01:00:00Z'
);
`,
      { serviceRole: true },
    );
    const writer = runSqlAsync(`
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SELECT pg_catalog.set_config(
  'dayopt.timeblock_supported_writer_user_id',
  '${USER_B}',
  true
);
UPDATE public.plans
SET note = 'forged GUC still serialized'
WHERE id = '${planB}';
COMMIT;
`);

    try {
      await waitForAdvisoryWaiter('dayopt:timeblock-global-direct-write');
      await holder.release();
      await writer;
    } finally {
      await holder.release(false);
      await writer.catch(() => undefined);
    }

    expect(runSql(`SELECT note FROM public.plans WHERE id = '${planB}';`)).toBe(
      'forged GUC still serialized',
    );
  });

  it('同一transactionのPlanとRecord変更はrevisionを一度だけ進める', () => {
    const [planId] = createPlan(USER_A, 'Cross-table Plan', 12);
    const [recordId] = createRecord(USER_A, 'Cross-table Record', 12);
    const before = readRevision(USER_A);

    runServiceRoleSql(`
UPDATE public.plans SET note = 'cross-table plan' WHERE id = '${planId}';
UPDATE public.records SET note = 'cross-table record' WHERE id = '${recordId}';
`);

    expect(readRevision(USER_A)).toBe(before + 1n);
  });

  it('終了済みbackendのprivate transaction stateを次のwriterが回収する', () => {
    createPlan(USER_A, 'Stale state Plan', 11);
    createRecord(USER_B, 'Stale state Record', 11);

    expect(
      runSql(`
SELECT
  (SELECT pg_catalog.count(*) FROM private.timeblock_transaction_states)
  || '|'
  || (SELECT pg_catalog.count(*) FROM private.timeblock_transaction_revision_bumps);
`),
    ).toBe('1|1');
  });

  it('authenticated tag deleteはsupported userをbindしてrevisionを一度進める', () => {
    const [planId] = createPlan(USER_A, 'Authenticated tag Plan', 13);
    const tagId = crypto.randomUUID();
    runSql(`
INSERT INTO public.tags (id, user_id, name, sort_order)
VALUES ('${tagId}', '${USER_A}', 'Authenticated revision tag', 0);
UPDATE public.plans SET tag_id = '${tagId}' WHERE id = '${planId}';
`);
    const before = readRevision(USER_A);

    runSql(`
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"role":"authenticated","sub":"${USER_A}"}';
DELETE FROM public.tags WHERE id = '${tagId}';
COMMIT;
`);

    expect(readRevision(USER_A)).toBe(before + 1n);
    expect(runSql(`SELECT (tag_id IS NULL)::TEXT FROM public.plans WHERE id = '${planId}';`)).toBe(
      'true',
    );
  });

  it('direct multi-user DMLとtag detachをtable境界で検知する', () => {
    const [planA] = createPlan(USER_A, 'Direct A', 2);
    const [secondPlanA] = createPlan(USER_A, 'Direct A2', 3);
    const [planB] = createPlan(USER_B, 'Direct B', 4);
    const beforeA = readRevision(USER_A);
    const beforeB = readRevision(USER_B);

    runServiceRoleSql(`
UPDATE public.plans
SET note = 'direct multi-user update'
WHERE id IN ('${planA}', '${secondPlanA}', '${planB}');
`);

    expect(readRevision(USER_A)).toBe(beforeA + 1n);
    expect(readRevision(USER_B)).toBe(beforeB + 1n);

    const tagId = crypto.randomUUID();
    runSql(`
INSERT INTO public.tags (id, user_id, name, sort_order)
VALUES ('${tagId}', '${USER_A}', 'Revision tag', 0);
UPDATE public.plans SET tag_id = '${tagId}' WHERE id = '${planA}';
`);
    const beforeDetach = readRevision(USER_A);

    runServiceRoleSql(`DELETE FROM public.tags WHERE id = '${tagId}';`);

    expect(readRevision(USER_A)).toBeGreaterThan(beforeDetach);
    expect(runSql(`SELECT (tag_id IS NULL)::TEXT FROM public.plans WHERE id = '${planA}';`)).toBe(
      'true',
    );
  });

  it('Plan対Record、tag対Record、account削除対writerを実接続で直列化する', async () => {
    const [planId, planVersion] = createPlan(USER_A, 'Concurrent Plan', 14);
    const [recordId, recordVersion] = createRecord(USER_A, 'Concurrent Record', 14);
    const planHolder = await holdTransaction(
      `
SELECT id
FROM public.update_plan_command_v1(
  '${USER_A}',
  '${planId}',
  '${planVersion}',
  'Concurrent Plan held',
  NULL,
  NULL,
  NULL,
  '2030-01-01T14:00:00Z',
  '2030-01-01T15:00:00Z'
);
`,
      { serviceRole: true },
    );
    const recordWriter = runSqlAsync(
      `
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SELECT id
FROM public.update_record_command_v1(
  '${USER_A}',
  '${recordId}',
  '${recordVersion}',
  'Concurrent Record after Plan',
  NULL,
  NULL,
  NULL,
  NULL,
  '2020-01-01T14:00:00Z',
  '2020-01-01T15:00:00Z'
);
COMMIT;
`,
      'step5-plan-record-writer',
    );

    try {
      await waitForApplicationLock('step5-plan-record-writer');
      await planHolder.release();
      await recordWriter;
    } finally {
      await planHolder.release(false);
      await recordWriter.catch(() => undefined);
    }

    expect(runSql(`SELECT title FROM public.records WHERE id = '${recordId}';`)).toBe(
      'Concurrent Record after Plan',
    );

    const tagId = crypto.randomUUID();
    runSql(`
INSERT INTO public.tags (id, user_id, name, sort_order)
VALUES ('${tagId}', '${USER_A}', 'Concurrent tag', 0);
`);
    const [tagRecordId, tagRecordVersion] = createRecord(USER_A, 'Tag race Record', 16);
    const tagHolder = await holdTransaction(
      `
SELECT public.delete_tags_with_timeblocks_command_v3(
  '${USER_A}',
  ARRAY['${tagId}'::UUID],
  'require_empty',
  NULL,
  false
);
`,
      { serviceRole: true },
    );
    const tagRecordWriter = runSqlAsync(
      `
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SELECT id
FROM public.update_record_command_v1(
  '${USER_A}',
  '${tagRecordId}',
  '${tagRecordVersion}',
  'Record after tag delete',
  NULL,
  NULL,
  NULL,
  NULL,
  '2020-01-01T16:00:00Z',
  '2020-01-01T17:00:00Z'
);
COMMIT;
`,
      'step5-tag-record-writer',
    );

    try {
      await waitForAdvisoryWaiter(`dayopt:timeblock-user-write:${USER_A}`);
      await tagHolder.release();
      await tagRecordWriter;
    } finally {
      await tagHolder.release(false);
      await tagRecordWriter.catch(() => undefined);
    }

    expect(runSql(`SELECT title FROM public.records WHERE id = '${tagRecordId}';`)).toBe(
      'Record after tag delete',
    );

    const accountId = crypto.randomUUID();
    createUser(accountId);
    createPlan(accountId, 'Account cascade Plan', 18);
    const accountHolder = await holdTransaction(`
DELETE FROM auth.users WHERE id = '${accountId}';
`);
    const accountWriterResult = runSqlAsync(
      `
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
SELECT id
FROM public.create_plan_command_v1(
  '${accountId}',
  'Writer after account delete',
  NULL,
  NULL,
  NULL,
  'manual',
  '2030-01-01T20:00:00Z',
  '2030-01-01T21:00:00Z'
);
COMMIT;
`,
      'step5-account-writer',
    ).then(
      () => ({ success: true, message: '' }),
      (error: unknown) => ({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    try {
      await waitForApplicationLock('step5-account-writer');
      await accountHolder.release();
      const result = await accountWriterResult;
      expect(result.success).toBe(false);
      expect(result.message).toContain('Timeblock user not found');
    } finally {
      await accountHolder.release(false);
      await accountWriterResult;
    }

    expect(runSql(`SELECT pg_catalog.count(*) FROM auth.users WHERE id = '${accountId}';`)).toBe(
      '0',
    );
  }, 20_000);

  it('account cascadeはrevision rowを再作成せず、service-role TRUNCATEは拒否する', () => {
    const accountId = crypto.randomUUID();
    createUser(accountId);
    createPlan(accountId, 'Delete account revision', 6);
    expect(readRevision(accountId)).toBeGreaterThan(0n);

    runSql(`DELETE FROM auth.users WHERE id = '${accountId}';`);

    expect(
      runSql(`
SELECT
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '${accountId}')
  AND NOT EXISTS (
    SELECT 1 FROM private.timeblock_user_revisions WHERE user_id = '${accountId}'
  );
`),
    ).toBe('t');

    expect(
      runSql(`
SELECT
  NOT pg_catalog.has_table_privilege('service_role', 'public.plans', 'TRUNCATE')
  AND NOT pg_catalog.has_table_privilege('service_role', 'public.records', 'TRUNCATE');
`),
    ).toBe('t');

    const truncateDenied = runSql(`
BEGIN;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    TRUNCATE public.plans;
    RAISE EXCEPTION 'service-role truncate unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
ROLLBACK;
SELECT 'denied';
`);
    expect(truncateDenied).toBe('denied');
  });
});
