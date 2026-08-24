import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const userId = crypto.randomUUID();

function runSql(sql: string): string {
  return execFileSync('psql', [DATABASE_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    encoding: 'utf8',
    input: sql,
  }).trim();
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

/**
 * 直接 DML を行う writer の role preamble。
 *
 * Candidate 6 (20260730090300 / 20260730090301) で authenticated から plans / records の
 * 直接 DML を剥がしたため、direct writer として残るのは service_role だけ。この suite が
 * 検証するのは writer fence の lock 順序と revision 意味論であり、どちらも role に依存
 * しないので、persona だけを差し替える。
 */
const DIRECT_WRITER_PREAMBLE = `
  SET LOCAL ROLE service_role;
  SET LOCAL request.jwt.claims TO '{"role":"service_role"}';
`;

/** 旧 bundle 互換の 3 RPC は drain まで authenticated で動く。owner 照合に sub が要る。 */
function legacyWriterPreamble(targetUserId: string): string {
  return `
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims TO '{"role":"authenticated","sub":"${targetUserId}"}';
  `;
}

async function runSqlAsync(sql: string, applicationName: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('psql', [DATABASE_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...process.env, PGAPPNAME: applicationName },
    });
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
): Promise<{ release: (commit?: boolean) => Promise<void> }> {
  const child = spawn('psql', [DATABASE_URL, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']);
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
  child.stdin.write(`
    BEGIN;
    ${sql}
    SELECT 'LOCKED';
  `);

  const deadline = Date.now() + 5_000;
  while (!stdout.includes('LOCKED')) {
    if (child.exitCode !== null) throw new Error(`Lock holder exited: ${stderr}`);
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for lock holder: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return {
    release: async (commit = true) => {
      if (child.exitCode !== null) return;
      child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
      const [code] = await once(child, 'close');
      if (code !== 0) {
        throw new Error(stderr.trim() || `Lock holder exited with code ${String(code)}`);
      }
    },
  };
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

function createUser(targetUserId: string): void {
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
      '${targetUserId}',
      '00000000-0000-0000-0000-000000000000',
      'stage1-fence-${targetUserId}@example.com',
      '',
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
  `);
}

function readRevision(targetUserId: string): bigint {
  return BigInt(
    runServiceRoleSql(`
      SELECT revision
      FROM public.get_timeblock_context_marker_v1('${targetUserId}');
    `),
  );
}

function createPlan(targetUserId: string): string {
  return runSql(`
    INSERT INTO public.plans (
      user_id, title, source, start_at, end_at
    ) VALUES (
      '${targetUserId}',
      'Writer fence Plan',
      'manual',
      pg_catalog.now() + INTERVAL '12 hours',
      pg_catalog.now() + INTERVAL '13 hours'
    )
    RETURNING id;
  `);
}

function createRecord(targetUserId: string): string {
  return runSql(`
    INSERT INTO public.records (
      user_id, title, source, start_at, end_at
    ) VALUES (
      '${targetUserId}',
      'Writer fence Record',
      'manual',
      pg_catalog.now() - INTERVAL '13 hours',
      pg_catalog.now() - INTERVAL '12 hours'
    )
    RETURNING id;
  `);
}

function setMcpControl(enabled: boolean): void {
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

function createMcpAuthorization(targetUserId: string) {
  const connectionId = crypto.randomUUID();
  const accessTokenId = crypto.randomUUID();
  runSql(`
    UPDATE public.profiles
    SET subscription_status = 'active'
    WHERE id = '${targetUserId}';

    INSERT INTO public.oauth_connections (
      id,
      user_id,
      client_id,
      resource_uri,
      scopes,
      reauth_required_at,
      write_enabled_at
    ) VALUES (
      '${connectionId}',
      '${targetUserId}',
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
    ) VALUES (
      '${accessTokenId}',
      '${targetUserId}',
      'stage1-${accessTokenId}',
      'access',
      'chatgpt',
      ARRAY['read:entries', 'write:plans']::TEXT[],
      pg_catalog.clock_timestamp() + INTERVAL '1 hour',
      '${connectionId}',
      'https://mcp.dayopt.app'
    );
  `);
  return { connectionId, accessTokenId };
}

describe.skipIf(!RUN_LOCAL)('MCP Stage 1 writer revision and fence', () => {
  beforeAll(() => {
    createUser(userId);
  });

  afterAll(() => {
    setMcpControl(false);
    runSql(`DELETE FROM auth.users WHERE id = '${userId}';`);
  });

  it('bumps one revision per committed transaction and never on rollback', () => {
    const before = readRevision(userId);
    runServiceRoleSql(`
      SELECT id
      FROM public.create_plan_command_v1(
        '${userId}',
        'Revision Plan',
        NULL,
        NULL,
        'manual',
        pg_catalog.now() + INTERVAL '4 hours',
        pg_catalog.now() + INTERVAL '5 hours'
      );

      SELECT id
      FROM public.create_record_command_v1(
        '${userId}',
        'Revision Record',
        NULL,
        NULL,
        NULL,
        'manual',
        pg_catalog.now() - INTERVAL '5 hours',
        pg_catalog.now() - INTERVAL '4 hours'
      );
    `);
    expect(readRevision(userId)).toBe(before + 1n);

    const committed = readRevision(userId);
    runSql(`
      BEGIN;
      ${DIRECT_WRITER_PREAMBLE}
      INSERT INTO public.plans (
        user_id, title, source, start_at, end_at
      ) VALUES (
        '${userId}',
        'Rolled back Plan',
        'manual',
        pg_catalog.now() + INTERVAL '6 hours',
        pg_catalog.now() + INTERVAL '7 hours'
      );
      ROLLBACK;
    `);
    expect(readRevision(userId)).toBe(committed);
  });

  it('initializes and removes the revision marker with the auth user lifecycle', () => {
    const lifecycleUserId = crypto.randomUUID();
    createUser(lifecycleUserId);

    expect(
      runSql(`
        SELECT revision
        FROM private.timeblock_user_revisions
        WHERE user_id = '${lifecycleUserId}';
      `),
    ).toBe('0');

    runSql(`DELETE FROM auth.users WHERE id = '${lifecycleUserId}';`);

    expect(
      runSql(`
        SELECT pg_catalog.count(*)
        FROM private.timeblock_user_revisions
        WHERE user_id = '${lifecycleUserId}';
      `),
    ).toBe('0');
  });

  it('does not serialize direct Product writes for unrelated users', async () => {
    const unrelatedUserId = crypto.randomUUID();
    createUser(unrelatedUserId);
    const directHolder = await holdTransaction(`
      ${DIRECT_WRITER_PREAMBLE}
      INSERT INTO public.plans (
        user_id, title, source, start_at, end_at
      ) VALUES (
        '${userId}',
        'Held direct Plan',
        'manual',
        pg_catalog.now() + INTERVAL '8 hours',
        pg_catalog.now() + INTERVAL '9 hours'
      );
    `);
    const unrelatedWrite = runSqlAsync(
      `
        BEGIN;
        ${DIRECT_WRITER_PREAMBLE}
        INSERT INTO public.plans (
          user_id, title, source, start_at, end_at
        ) VALUES (
          '${unrelatedUserId}',
          'Unrelated direct Plan',
          'manual',
          pg_catalog.now() + INTERVAL '10 hours',
          pg_catalog.now() + INTERVAL '11 hours'
        );
        COMMIT;
      `,
      'candidate1-unrelated-direct-write',
    );

    try {
      await expect(unrelatedWrite).resolves.toEqual(expect.any(String));
    } finally {
      await directHolder.release(false);
      await unrelatedWrite.catch(() => undefined);
      runSql(`DELETE FROM auth.users WHERE id = '${unrelatedUserId}';`);
    }
  });

  it.each([
    {
      kind: 'Plan',
      table: 'plans',
      create: createPlan,
      deleteRpc: 'soft_delete_plan',
      idArgument: 'p_plan_id',
    },
    {
      kind: 'Record',
      table: 'records',
      create: createRecord,
      deleteRpc: 'soft_delete_record',
      idArgument: 'p_record_id',
    },
  ] as const)(
    'keeps a direct $kind update and legacy delete in one deadlock-free lock order',
    async ({ table, create, deleteRpc, idArgument }) => {
      const targetId = create(userId);
      readRevision(userId);
      const directUpdate = await holdTransaction(`
        ${DIRECT_WRITER_PREAMBLE}
        UPDATE public.${table}
        SET title = title || ' updated'
        WHERE id = '${targetId}';
      `);
      const legacyDelete = runSqlAsync(
        `
          BEGIN;
          ${legacyWriterPreamble(userId)}
          SELECT public.${deleteRpc}(
            ${idArgument} => '${targetId}',
            p_user_id => '${userId}'
          );
          COMMIT;
          SELECT 'deleted';
        `,
        `candidate1-${table}-legacy-delete`,
      );

      try {
        await waitForApplicationLock(`candidate1-${table}-legacy-delete`);
        await directUpdate.release();
        await expect(legacyDelete).resolves.toContain('deleted');
      } finally {
        await directUpdate.release(false);
        await legacyDelete.catch(() => undefined);
      }

      expect(
        runSql(`SELECT deleted_at IS NOT NULL FROM public.${table} WHERE id = '${targetId}';`),
      ).toBe('t');
    },
    15_000,
  );

  it('keeps a first direct update and account deletion deadlock-free without a marker', async () => {
    const deletingUserId = crypto.randomUUID();
    createUser(deletingUserId);
    const targetPlanId = createPlan(deletingUserId);
    readRevision(deletingUserId);
    runSql(`
      DELETE FROM private.timeblock_user_revisions
      WHERE user_id = '${deletingUserId}';
    `);
    const directUpdate = await holdTransaction(`
      ${DIRECT_WRITER_PREAMBLE}
      UPDATE public.plans
      SET title = title || ' updated'
      WHERE id = '${targetPlanId}';
    `);
    const accountDelete = runSqlAsync(
      `
        DELETE FROM auth.users WHERE id = '${deletingUserId}';
        SELECT 'account-deleted';
      `,
      'candidate1-account-delete-lock-order',
    );

    try {
      await waitForApplicationLock('candidate1-account-delete-lock-order');
      await directUpdate.release();
      await expect(accountDelete).resolves.toContain('account-deleted');
    } finally {
      await directUpdate.release(false);
      await accountDelete.catch(() => undefined);
      runSql(`DELETE FROM auth.users WHERE id = '${deletingUserId}';`);
    }
  }, 15_000);

  it('rejects shared-to-exclusive lock upgrade before another user lock', () => {
    const result = runSql(`
      DO $$
      BEGIN
        PERFORM private.lock_timeblock_user_write_shared_v1('${userId}');
        BEGIN
          PERFORM private.lock_timeblock_user_write_exclusive_v1('${userId}');
          RAISE EXCEPTION 'lock upgrade unexpectedly succeeded';
        EXCEPTION WHEN SQLSTATE '22023' THEN
          NULL;
        END;
      END;
      $$;
      SELECT 'upgrade-rejected';
    `);
    expect(result).toBe('upgrade-rejected');
  });

  it('maps account deletion after the connection pre-read to DM004', async () => {
    const raceUserId = crypto.randomUUID();
    createUser(raceUserId);
    setMcpControl(true);
    const authorization = createMcpAuthorization(raceUserId);

    let deletionHolder: Awaited<ReturnType<typeof holdTransaction>> | undefined;
    let authorize: Promise<string> | undefined;

    try {
      deletionHolder = await holdTransaction(`
        DELETE FROM auth.users WHERE id = '${raceUserId}';
      `);
      authorize = runSqlAsync(
        `
          DO $$
          BEGIN
            BEGIN
              PERFORM *
              FROM private.authorize_mcp_mutation_v1(
                '${authorization.connectionId}',
                '${authorization.accessTokenId}',
                'write:plans',
                '${crypto.randomUUID()}'
              );
              RAISE EXCEPTION 'authorization unexpectedly survived account deletion';
            EXCEPTION WHEN SQLSTATE 'DM004' THEN
              NULL;
            END;
          END;
          $$;
          SELECT 'authorization-lost';
        `,
        'candidate1-authorization-loss',
      );
      await waitForApplicationLock('candidate1-authorization-loss');
      await deletionHolder.release();

      await expect(authorize).resolves.toBe('authorization-lost');
    } finally {
      await deletionHolder?.release(false);
      await authorize?.catch(() => undefined);
      setMcpControl(false);
      runSql(`DELETE FROM auth.users WHERE id = '${raceUserId}';`);
    }
  }, 15_000);
});
