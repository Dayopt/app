import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

import { afterEach, describe, expect, it } from 'vitest';

const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

function createRunProjectNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (value, index) =>
    String(index === 0 ? (value % 9) + 1 : value % 10),
  ).join('');
}

const PROJECT_KEY = createRunProjectNumber();
const OAUTH_CLIENT_ID = `${PROJECT_KEY}-dayoptcalendar.apps.googleusercontent.com`;
const userId = crypto.randomUUID();
const userEmail = `calendar-expiry-lock-${userId}@example.com`;
const firstConnectionId = crypto.randomUUID();
const secondConnectionId = crypto.randomUUID();
const firstOperationId = crypto.randomUUID();
const secondOperationId = crypto.randomUUID();

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

function psqlEnv(applicationName?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGPASSWORD: 'postgres',
    ...(applicationName ? { PGAPPNAME: applicationName } : {}),
  };
}

function ownerSql(sql: string, variables: Record<string, string> = {}): string {
  const result = spawnSync('psql', psqlArgs(variables), {
    encoding: 'utf8',
    env: psqlEnv(),
    input: sql,
  });

  if (result.status !== 0) {
    throw new Error(`Calendar expiry SQL failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function serviceRoleSql(sql: string, variables: Record<string, string> = {}): string {
  const output = ownerSql(
    `SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  FALSE
);
${sql}`,
    variables,
  );

  return output.split('\n').at(-1) ?? '';
}

async function serviceRoleSqlAsync(
  sql: string,
  variables: Record<string, string> = {},
  timeoutMs = 1_000,
): Promise<string> {
  const process = spawn('psql', psqlArgs(variables), {
    env: psqlEnv('calendar-ciphertext-expiry-runner'),
  });
  let stdout = '';
  let stderr = '';
  let spawnError: Error | null = null;
  let timedOut = false;

  process.stdout.setEncoding('utf8');
  process.stderr.setEncoding('utf8');
  process.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  process.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  process.once('error', (error) => {
    spawnError = error;
  });

  const closed = once(process, 'close');
  process.stdin.end(
    `SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  FALSE
);
${sql}`,
  );

  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill('SIGTERM');
  }, timeoutMs);
  const [exitCode, signal] = await closed;
  clearTimeout(timeout);

  if (timedOut) {
    throw new Error(`Calendar expiry SQL exceeded ${timeoutMs}ms and was terminated: ${stderr}`);
  }
  if (spawnError) {
    throw spawnError;
  }
  if (exitCode !== 0) {
    throw new Error(`Calendar expiry SQL failed with ${String(signal ?? exitCode)}: ${stderr}`);
  }

  return stdout.trim().split('\n').at(-1) ?? '';
}

async function holdOperationRowLock(operationId: string): Promise<{
  isActive: () => boolean;
  release: () => Promise<void>;
}> {
  const process = spawn('psql', psqlArgs({ operation_id: operationId }), {
    env: psqlEnv('calendar-ciphertext-expiry-lock-holder'),
  });
  let stdout = '';
  let stderr = '';

  process.stdout.setEncoding('utf8');
  process.stderr.setEncoding('utf8');
  process.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  process.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const closed = once(process, 'close');

  async function terminateProcess(): Promise<void> {
    if (process.exitCode === null && process.signalCode === null) {
      process.kill('SIGTERM');
    }
    await closed;
  }

  process.stdin.write(
    `BEGIN;
SELECT operation.operation_id
FROM private.calendar_revoke_operations AS operation
WHERE operation.operation_id = :'operation_id'::UUID
FOR UPDATE;
SELECT 'LOCKED';
`,
  );

  const deadline = Date.now() + 5_000;
  while (!stdout.includes('LOCKED')) {
    if (process.exitCode !== null || process.signalCode !== null) {
      await closed;
      throw new Error(`Calendar expiry lock holder exited: ${stderr}`);
    }
    if (Date.now() >= deadline) {
      await terminateProcess();
      throw new Error(`Timed out acquiring Calendar expiry row lock: ${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return {
    isActive: () => process.exitCode === null && process.signalCode === null,
    release: async () => {
      if (process.exitCode === null && process.signalCode === null) {
        process.stdin.end('ROLLBACK;\n');
      }
      await closed;
    },
  };
}

function assertNoCalendarAuthorityProject(): void {
  const existingProjectCount = ownerSql(
    'SELECT pg_catalog.count(*)::TEXT FROM private.calendar_authority_projects;',
  );

  if (existingProjectCount !== '0') {
    throw new Error('Calendar expiry fixture requires an empty authority project singleton');
  }
}

function deleteOwnedCalendarAuthorityProject(projectKey: string): void {
  ownerSql(
    `DELETE FROM private.calendar_authority_fences
WHERE project_key = :'project_key';
DELETE FROM private.calendar_authority_projects
WHERE project_key = :'project_key';`,
    { project_key: projectKey },
  );
}

function cleanupFixture(projectCreated: boolean): void {
  ownerSql(
    `DELETE FROM private.calendar_revoke_outbox
WHERE id IN (:'first_operation_id'::UUID, :'second_operation_id'::UUID);
DELETE FROM private.calendar_revoke_operations
WHERE operation_id IN (:'first_operation_id'::UUID, :'second_operation_id'::UUID);
DELETE FROM public.calendar_connections
WHERE id IN (:'first_connection_id'::UUID, :'second_connection_id'::UUID);
DELETE FROM auth.users WHERE id = :'user_id'::UUID;`,
    {
      first_operation_id: firstOperationId,
      first_connection_id: firstConnectionId,
      second_operation_id: secondOperationId,
      second_connection_id: secondConnectionId,
      user_id: userId,
    },
  );

  if (projectCreated) {
    deleteOwnedCalendarAuthorityProject(PROJECT_KEY);
  }
}

describe.skipIf(!RUN_LOCAL)('Calendar ciphertext expiry lock isolation', () => {
  let heldLock: Awaited<ReturnType<typeof holdOperationRowLock>> | null = null;
  let projectCreated = false;

  afterEach(async () => {
    await heldLock?.release();
    heldLock = null;
    cleanupFixture(projectCreated);
    projectCreated = false;
  });

  it('keeps completed candidates and defers a row contended beyond 100ms', async () => {
    assertNoCalendarAuthorityProject();
    serviceRoleSql(
      `SELECT public.provision_calendar_authority_project_v1(
  :'project_key',
  :'oauth_client_id'
);`,
      {
        oauth_client_id: OAUTH_CLIENT_ID,
        project_key: PROJECT_KEY,
      },
    );
    projectCreated = true;
    serviceRoleSql(
      `UPDATE private.calendar_authority_projects AS project
SET activation_version = 1,
    activated_at = pg_catalog.clock_timestamp()
WHERE project.project_key = :'project_key';`,
      { project_key: PROJECT_KEY },
    );

    const setupResult = serviceRoleSql(
      `INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  :'user_id'::UUID,
  'authenticated',
  'authenticated',
  :'user_email',
  '',
  '{}'::JSONB,
  '{}'::JSONB,
  pg_catalog.now(),
  pg_catalog.now()
);

SELECT private.get_or_create_calendar_subject_fence_v1(
  :'project_key',
  'calendar-expiry-first-subject'
);

INSERT INTO public.calendar_connections (
  id,
  user_id,
  provider,
  provider_account_id,
  granted_scopes,
  refresh_token_enc,
  status,
  data_generation,
  authority_fence_id,
  authority_epoch
)
SELECT
  :'first_connection_id'::UUID,
  :'user_id'::UUID,
  'google',
  'calendar-expiry-first-subject',
  ARRAY['calendar.readonly']::TEXT[],
  'v1.first',
  'active',
  0,
  fence.id,
  fence.epoch
FROM private.calendar_authority_fences AS fence
WHERE fence.project_key = :'project_key'
  AND fence.scope_kind = 'subject'
  AND fence.provider_account_id = 'calendar-expiry-first-subject';

SELECT private.get_or_create_calendar_subject_fence_v1(
  :'project_key',
  'calendar-expiry-second-subject'
);

INSERT INTO public.calendar_connections (
  id,
  user_id,
  provider,
  provider_account_id,
  granted_scopes,
  refresh_token_enc,
  status,
  data_generation,
  authority_fence_id,
  authority_epoch
)
SELECT
  :'second_connection_id'::UUID,
  :'user_id'::UUID,
  'google',
  'calendar-expiry-second-subject',
  ARRAY['calendar.readonly']::TEXT[],
  'v1.second',
  'active',
  0,
  fence.id,
  fence.epoch
FROM private.calendar_authority_fences AS fence
WHERE fence.project_key = :'project_key'
  AND fence.scope_kind = 'subject'
  AND fence.provider_account_id = 'calendar-expiry-second-subject';

SELECT public.disconnect_calendar_connection_command_v1(
  :'first_operation_id'::UUID,
  :'project_key',
  :'user_id'::UUID,
  :'first_connection_id'::UUID
);
SELECT public.disconnect_calendar_connection_command_v1(
  :'second_operation_id'::UUID,
  :'project_key',
  :'user_id'::UUID,
  :'second_connection_id'::UUID
);

UPDATE private.calendar_revoke_operations AS operation
SET created_at = pg_catalog.clock_timestamp() - INTERVAL '2 hours',
    expires_at = CASE
      WHEN operation.operation_id = :'first_operation_id'::UUID
        THEN pg_catalog.clock_timestamp() - INTERVAL '2 minutes'
      ELSE pg_catalog.clock_timestamp() - INTERVAL '1 minute'
    END
WHERE operation.operation_id IN (
  :'first_operation_id'::UUID,
  :'second_operation_id'::UUID
);

-- outbox の expires_at は未来に保つ（#1866）。この列を読むのは pg_cron の
-- ハード期限切れ掃除（expire-calendar-revoke-outbox、毎分、FOR UPDATE SKIP LOCKED、
-- operation の state / lock を見ない）だけで、テスト対象の
-- expire_calendar_revoke_authority_v3 経路は operations 側の expires_at のみ参照する。
-- ここを過去に倒すと、setup〜assertion の間に cron tick が挟まった時だけ
-- deferred 行の outbox まで消えて '0|1' 期待が '0|0' になる（CI flake の原因）。
UPDATE private.calendar_revoke_outbox AS queued
SET created_at = pg_catalog.clock_timestamp() - INTERVAL '2 hours',
    expires_at = pg_catalog.clock_timestamp() + INTERVAL '1 hour'
WHERE queued.id IN (
  :'first_operation_id'::UUID,
  :'second_operation_id'::UUID
);

SELECT
  (
    SELECT pg_catalog.count(*)::TEXT
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id IN (
      :'first_operation_id'::UUID,
      :'second_operation_id'::UUID
    )
  ) || '|' ||
  (
    SELECT pg_catalog.count(*)::TEXT
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id IN (
      :'first_operation_id'::UUID,
      :'second_operation_id'::UUID
    )
  ) || '|' ||
  (
    SELECT pg_catalog.count(*)::TEXT
    FROM public.calendar_connections AS connection
    WHERE connection.id IN (
      :'first_connection_id'::UUID,
      :'second_connection_id'::UUID
    )
  );`,
      {
        first_connection_id: firstConnectionId,
        first_operation_id: firstOperationId,
        project_key: PROJECT_KEY,
        second_connection_id: secondConnectionId,
        second_operation_id: secondOperationId,
        user_email: userEmail,
        user_id: userId,
      },
    );
    expect(setupResult).toBe('2|2|0');

    expect(
      ownerSql(
        `SELECT
  pg_catalog.count(*)::TEXT || '|' ||
  pg_catalog.count(*) FILTER (
    WHERE operation.state = 'pending'
      AND operation.expires_at <= pg_catalog.clock_timestamp()
      AND operation.operation_kind <> 'account_delete'
  )::TEXT || '|' ||
  (
    SELECT pg_catalog.count(*)::TEXT
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id IN (
      :'first_operation_id'::UUID,
      :'second_operation_id'::UUID
    )
  )
FROM private.calendar_revoke_operations AS operation
WHERE operation.operation_id IN (
  :'first_operation_id'::UUID,
  :'second_operation_id'::UUID
);`,
        {
          first_operation_id: firstOperationId,
          second_operation_id: secondOperationId,
        },
      ),
    ).toBe('2|2|2');

    expect(
      ownerSql(
        `SELECT
  (
    COALESCE(
      (
        SELECT function.proconfig
        FROM pg_catalog.pg_proc AS function
        WHERE function.oid =
          'private.expire_calendar_revoke_ciphertexts_internal_v1(uuid,integer)'::REGPROCEDURE
      ),
      ARRAY[]::TEXT[]
    ) @> ARRAY['lock_timeout=100ms']::TEXT[]
  )::TEXT || '|' ||
  (
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(
        COALESCE(
          (
            SELECT function.proconfig
            FROM pg_catalog.pg_proc AS function
            WHERE function.oid =
              'private.expire_calendar_revoke_operation_item_v1(uuid,timestamp with time zone)'::REGPROCEDURE
          ),
          ARRAY[]::TEXT[]
        )
      ) AS setting
      WHERE setting LIKE 'lock_timeout=%'
    )
  )::TEXT;`,
      ),
    ).toBe('true|true');

    heldLock = await holdOperationRowLock(secondOperationId);

    const expiryStartedAt = performance.now();
    const expiryResult = await serviceRoleSqlAsync(
      `SELECT
  result.ciphertexts_deleted::TEXT || '|' ||
  result.ciphertexts_deferred::TEXT
FROM public.expire_calendar_revoke_authority_v3(:'project_key', 100) AS result;`,
      { project_key: PROJECT_KEY },
    );

    expect(expiryResult).toBe('1|1');
    expect(performance.now() - expiryStartedAt).toBeLessThan(1_000);
    expect(heldLock.isActive()).toBe(true);
    expect(
      ownerSql(
        `SELECT
  pg_catalog.count(*) FILTER (
    WHERE queued.id = :'first_operation_id'::UUID
  )::TEXT || '|' ||
  pg_catalog.count(*) FILTER (
    WHERE queued.id = :'second_operation_id'::UUID
  )::TEXT
FROM private.calendar_revoke_outbox AS queued
WHERE queued.id IN (
  :'first_operation_id'::UUID,
  :'second_operation_id'::UUID
);`,
        {
          first_operation_id: firstOperationId,
          second_operation_id: secondOperationId,
        },
      ),
    ).toBe('0|1');

    await heldLock.release();
    heldLock = null;

    expect(
      serviceRoleSql(
        `SELECT
  result.ciphertexts_deleted::TEXT || '|' ||
  result.ciphertexts_deferred::TEXT
FROM public.expire_calendar_revoke_authority_v3(:'project_key', 100) AS result;`,
        { project_key: PROJECT_KEY },
      ),
    ).toBe('1|0');
  });

  it('leaves a pre-existing singleton untouched when the fixture precondition fails', () => {
    const existingProjectKey = createRunProjectNumber();
    const existingClientId = `${existingProjectKey}-existing.apps.googleusercontent.com`;

    assertNoCalendarAuthorityProject();
    serviceRoleSql(
      `SELECT public.provision_calendar_authority_project_v1(
  :'project_key',
  :'oauth_client_id'
);`,
      {
        oauth_client_id: existingClientId,
        project_key: existingProjectKey,
      },
    );

    try {
      expect(assertNoCalendarAuthorityProject).toThrow(
        'Calendar expiry fixture requires an empty authority project singleton',
      );

      cleanupFixture(false);

      expect(
        ownerSql(
          `SELECT project.project_key || '|' || project.oauth_client_id
FROM private.calendar_authority_projects AS project
WHERE project.project_key = :'project_key';`,
          { project_key: existingProjectKey },
        ),
      ).toBe(`${existingProjectKey}|${existingClientId}`);
    } finally {
      deleteOwnedCalendarAuthorityProject(existingProjectKey);
    }
  });
});
