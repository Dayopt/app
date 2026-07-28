import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';
const TEST_PASSWORD = 'account-gate-race-password';
const REQUEST_DIGEST = 'c'.repeat(64);
const CUSTOMER_EMAIL_DIGEST = 'd'.repeat(64);
const STORAGE_OBJECT_NAME = 'storage-first.txt';

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const storageFirstUserId = crypto.randomUUID();
const storageGateFirstUserId = crypto.randomUUID();
const billingFirstUserId = crypto.randomUUID();
const billingGateFirstUserId = crypto.randomUUID();
const customerStartFirstUserId = crypto.randomUUID();
const customerGateFirstUserId = crypto.randomUUID();
const planWriterFirstUserId = crypto.randomUUID();
const planGateFirstUserId = crypto.randomUUID();
const recordGateFirstUserId = crypto.randomUUID();
const userIds = [
  storageFirstUserId,
  storageGateFirstUserId,
  billingFirstUserId,
  billingGateFirstUserId,
  customerStartFirstUserId,
  customerGateFirstUserId,
  planWriterFirstUserId,
  planGateFirstUserId,
  recordGateFirstUserId,
];

interface SqlResult {
  code: number | null;
  stderr: string;
  stdout: string;
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
    throw new Error(`Account deletion race SQL failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function setGateActivation(active: boolean): void {
  ownerSql(
    `UPDATE private.account_deletion_control
SET activation_version = CASE WHEN :'active'::BOOLEAN THEN 1 ELSE 0 END,
    activated_at = CASE
      WHEN :'active'::BOOLEAN THEN pg_catalog.clock_timestamp()
      ELSE NULL
    END
WHERE singleton;`,
    { active: String(active) },
  );
}

function serviceRoleTransaction(sql: string): string {
  return `BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
${sql}
COMMIT;`;
}

function authenticatedStorageInsert(): string {
  return `BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'role',
    'authenticated',
    'sub',
    :'user_id'
  )::TEXT,
  true
);
INSERT INTO storage.objects (
  bucket_id,
  name,
  owner,
  owner_id,
  metadata
) VALUES (
  'attachments',
  :'user_id' || '/' || :'object_name',
  :'user_id'::UUID,
  :'user_id',
  '{}'::JSONB
);
COMMIT;`;
}

function directTimeblockInsert(table: 'plans' | 'records'): string {
  return `BEGIN;
INSERT INTO public.${table} (
  id,
  user_id,
  title,
  start_at,
  end_at,
  source
) VALUES (
  :'timeblock_id'::UUID,
  :'user_id'::UUID,
  :'title',
  :'start_at'::TIMESTAMPTZ,
  :'end_at'::TIMESTAMPTZ,
  'manual'
);
COMMIT;`;
}

async function runSqlAsync(
  sql: string,
  variables: Record<string, string>,
  applicationName: string,
): Promise<SqlResult> {
  const process = spawn('psql', psqlArgs(variables), {
    env: psqlEnv(applicationName),
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
  process.stdin.end(`\\set VERBOSITY verbose\n${sql}`);
  const [code] = (await once(process, 'close')) as [number | null];
  return { code, stderr, stdout: stdout.trim() };
}

async function holdTransaction(
  sql: string,
  variables: Record<string, string>,
  applicationName: string,
): Promise<{ release: (commit?: boolean) => Promise<SqlResult> }> {
  const process = spawn('psql', psqlArgs(variables), {
    env: psqlEnv(applicationName),
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
  process.stdin.write(`\\set VERBOSITY verbose\n${sql}\nSELECT 'LOCKED';\n`);

  const deadline = Date.now() + 5_000;
  while (!stdout.includes('LOCKED')) {
    if (process.exitCode !== null) {
      throw new Error(`Transaction holder exited before its barrier: ${stderr}`);
    }
    if (Date.now() >= deadline) {
      process.stdin.end('ROLLBACK;\n');
      throw new Error(`Timed out waiting for transaction holder: ${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  let releaseResult: Promise<SqlResult> | null = null;
  return {
    release: async (commit = true) => {
      if (!releaseResult) {
        process.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
        releaseResult = (async () => {
          const [code] = (await once(process, 'close')) as [number | null];
          return { code, stderr, stdout: stdout.trim() };
        })();
      }
      return releaseResult;
    },
  };
}

async function waitForApplicationLock(applicationName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiting = ownerSql(
      `SELECT pg_catalog.count(*)::TEXT
FROM pg_catalog.pg_stat_activity AS activity
WHERE activity.application_name = :'application_name'
  AND activity.wait_event_type = 'Lock';`,
      { application_name: applicationName },
    );
    if (Number(waiting) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${applicationName} to block on a lock`);
}

function cleanupUserState(userId: string): void {
  ownerSql(
    `DELETE FROM private.account_deletion_operations
WHERE user_id = :'user_id'::UUID;
DELETE FROM private.billing_mutation_claims
WHERE user_id = :'user_id'::UUID;`,
    { user_id: userId },
  );
}

async function prepareCustomerProvisioning(
  userId: string,
): Promise<{ leaseId: string; operationId: string }> {
  const operationId = crypto.randomUUID();
  const { error: mutationError } = await admin.rpc('claim_billing_mutation_v3', {
    p_mutation_kind: 'checkout',
    p_operation_id: operationId,
    p_request_digest: REQUEST_DIGEST,
    p_user_id: userId,
  });
  if (mutationError) throw mutationError;

  const { data, error } = await admin.rpc('claim_billing_customer_provisioning_v2', {
    p_email_digest: CUSTOMER_EMAIL_DIGEST,
    p_operation_id: operationId,
    p_user_id: userId,
  });
  if (error) throw error;

  const leaseId = data?.[0]?.lease_id;
  if (typeof leaseId !== 'string' || leaseId.length === 0) {
    throw new Error('Customer provisioning lease was not returned');
  }

  return { leaseId, operationId };
}

describe.skipIf(!RUN_LOCAL)('account deletion source-writer races', () => {
  beforeAll(async () => {
    setGateActivation(true);
    for (const userId of userIds) {
      const { error } = await admin.auth.admin.createUser({
        id: userId,
        email: `account-gate-race-${userId}@example.com`,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
    }
  });

  afterAll(async () => {
    setGateActivation(false);
    ownerSql(
      `BEGIN;
SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.objects
WHERE bucket_id = 'attachments'
  AND name = :'user_id' || '/' || :'object_name';
COMMIT;`,
      {
        object_name: STORAGE_OBJECT_NAME,
        user_id: storageFirstUserId,
      },
    );

    for (const userId of userIds) {
      cleanupUserState(userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('commits an authenticated Storage write that acquired the fence before begin', async () => {
    const holder = await holdTransaction(
      authenticatedStorageInsert().replace('COMMIT;', ''),
      {
        object_name: STORAGE_OBJECT_NAME,
        user_id: storageFirstUserId,
      },
      'account-gate-storage-first-holder',
    );
    const waiterName = 'account-gate-storage-first-begin';
    const beginAttempt = runSqlAsync(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ),
      { user_id: storageFirstUserId },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const beginResult = await beginAttempt;
      expect(beginResult.code).toBe(0);
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM storage.objects
WHERE bucket_id = 'attachments'
  AND name = :'user_id' || '/' || :'object_name';`,
          {
            object_name: STORAGE_OBJECT_NAME,
            user_id: storageFirstUserId,
          },
        ),
      ).toBe('1');
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM private.account_deletion_operations
WHERE user_id = :'user_id'::UUID;`,
          { user_id: storageFirstUserId },
        ),
      ).toBe('1');
    } finally {
      await holder.release(false);
      await beginAttempt;
    }
  });

  it('rejects an authenticated Storage write that waits behind begin', async () => {
    const holder = await holdTransaction(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ).replace('COMMIT;', ''),
      { user_id: storageGateFirstUserId },
      'account-gate-storage-gate-holder',
    );
    const waiterName = 'account-gate-storage-gate-writer';
    const writeAttempt = runSqlAsync(
      authenticatedStorageInsert(),
      {
        object_name: 'gate-first.txt',
        user_id: storageGateFirstUserId,
      },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const writeResult = await writeAttempt;
      expect(writeResult.code).not.toBe(0);
      expect(writeResult.stderr).toContain('42501');
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM storage.objects
WHERE bucket_id = 'attachments'
  AND name = :'user_id' || '/gate-first.txt';`,
          { user_id: storageGateFirstUserId },
        ),
      ).toBe('0');
    } finally {
      await holder.release(false);
      await writeAttempt;
    }
  });

  it('terminalizes a pre-provider billing claim that finishes before begin', async () => {
    const billingOperationId = crypto.randomUUID();
    const holder = await holdTransaction(
      serviceRoleTransaction(
        `SELECT *
FROM public.claim_billing_mutation_v3(
  'checkout',
  :'operation_id'::UUID,
  :'request_digest',
  :'user_id'::UUID
);`,
      ).replace('COMMIT;', ''),
      {
        operation_id: billingOperationId,
        request_digest: REQUEST_DIGEST,
        user_id: billingFirstUserId,
      },
      'account-gate-billing-first-holder',
    );
    const waiterName = 'account-gate-billing-first-begin';
    const beginAttempt = runSqlAsync(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ),
      { user_id: billingFirstUserId },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const beginResult = await beginAttempt;
      expect(beginResult.code).toBe(0);
      const deletionId = ownerSql(
        `SELECT deletion_id::TEXT
FROM private.account_deletion_operations
WHERE user_id = :'user_id'::UUID;`,
        { user_id: billingFirstUserId },
      );

      const { data: bindingData, error: bindingError } = await admin.rpc(
        'bind_billing_account_deletion_v1',
        {
          p_generic_deletion_id: deletionId,
          p_user_id: billingFirstUserId,
        },
      );
      expect(bindingError).toBeNull();
      expect(bindingData?.[0]).toEqual({
        binding_state: 'preparing',
        stripe_customer_id: null,
      });
      expect(
        ownerSql(
          `SELECT state || ':' || terminal_reason
FROM private.billing_mutation_claims
WHERE operation_id = :'operation_id'::UUID;`,
          { operation_id: billingOperationId },
        ),
      ).toBe('abandoned:account_deletion_before_provider_start');
    } finally {
      await holder.release(false);
      await beginAttempt;
    }
  });

  it('rejects a billing claim that waits behind begin', async () => {
    const billingOperationId = crypto.randomUUID();
    const holder = await holdTransaction(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ).replace('COMMIT;', ''),
      { user_id: billingGateFirstUserId },
      'account-gate-billing-gate-holder',
    );
    const waiterName = 'account-gate-billing-gate-writer';
    const billingAttempt = runSqlAsync(
      serviceRoleTransaction(
        `SELECT *
FROM public.claim_billing_mutation_v3(
  'checkout',
  :'operation_id'::UUID,
  :'request_digest',
  :'user_id'::UUID
);`,
      ),
      {
        operation_id: billingOperationId,
        request_digest: REQUEST_DIGEST,
        user_id: billingGateFirstUserId,
      },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const billingResult = await billingAttempt;
      expect(billingResult.code).not.toBe(0);
      expect(billingResult.stderr).toContain('AD019');
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM private.billing_mutation_claims
WHERE operation_id = :'operation_id'::UUID;`,
          { operation_id: billingOperationId },
        ),
      ).toBe('0');
    } finally {
      await holder.release(false);
      await billingAttempt;
    }
  });

  it('rolls back begin after a Customer provider start commits first', async () => {
    const { leaseId, operationId } = await prepareCustomerProvisioning(customerStartFirstUserId);
    const holder = await holdTransaction(
      serviceRoleTransaction(
        `SELECT public.start_billing_customer_provisioning_v2(
  :'lease_id'::UUID,
  :'operation_id'::UUID,
  :'user_id'::UUID
);`,
      ).replace('COMMIT;', ''),
      {
        lease_id: leaseId,
        operation_id: operationId,
        user_id: customerStartFirstUserId,
      },
      'account-gate-customer-start-holder',
    );
    const waiterName = 'account-gate-customer-start-begin';
    const beginAttempt = runSqlAsync(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ),
      { user_id: customerStartFirstUserId },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const beginResult = await beginAttempt;
      expect(beginResult.code).not.toBe(0);
      expect(beginResult.stderr).toContain('AD019');
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM private.account_deletion_operations
WHERE user_id = :'user_id'::UUID;`,
          { user_id: customerStartFirstUserId },
        ),
      ).toBe('0');
      expect(
        ownerSql(
          `SELECT state
FROM private.billing_customer_provisioning_attempts
WHERE operation_id = :'operation_id'::UUID;`,
          { operation_id: operationId },
        ),
      ).toBe('provider_started');
    } finally {
      await holder.release(false);
      await beginAttempt;
    }
  });

  it('rejects Customer provider start after begin commits first', async () => {
    const { leaseId, operationId } = await prepareCustomerProvisioning(customerGateFirstUserId);
    const holder = await holdTransaction(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ).replace('COMMIT;', ''),
      { user_id: customerGateFirstUserId },
      'account-gate-customer-gate-holder',
    );
    const waiterName = 'account-gate-customer-gate-start';
    const startAttempt = runSqlAsync(
      serviceRoleTransaction(
        `SELECT public.start_billing_customer_provisioning_v2(
  :'lease_id'::UUID,
  :'operation_id'::UUID,
  :'user_id'::UUID
);`,
      ),
      {
        lease_id: leaseId,
        operation_id: operationId,
        user_id: customerGateFirstUserId,
      },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const startResult = await startAttempt;
      expect(startResult.code).not.toBe(0);
      expect(startResult.stderr).toContain('AD019');
      expect(
        ownerSql(
          `SELECT state || ':' || terminal_reason
FROM private.billing_mutation_claims
WHERE operation_id = :'operation_id'::UUID;`,
          { operation_id: operationId },
        ),
      ).toBe('abandoned:account_deletion_before_provider_start');
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM private.billing_customer_provisioning_attempts
WHERE operation_id = :'operation_id'::UUID;`,
          { operation_id: operationId },
        ),
      ).toBe('0');
    } finally {
      await holder.release(false);
      await startAttempt;
    }
  });

  it('lets a direct Plan writer finish before begin without reversing the global lock order', async () => {
    const planId = crypto.randomUUID();
    const holder = await holdTransaction(
      directTimeblockInsert('plans').replace('COMMIT;', ''),
      {
        end_at: '2040-01-01T01:00:00Z',
        start_at: '2040-01-01T00:00:00Z',
        timeblock_id: planId,
        title: 'Plan writer before account deletion begin',
        user_id: planWriterFirstUserId,
      },
      'account-gate-plan-writer-holder',
    );
    const waiterName = 'account-gate-plan-writer-begin';
    const beginAttempt = runSqlAsync(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ),
      { user_id: planWriterFirstUserId },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const beginResult = await beginAttempt;
      expect(beginResult.code).toBe(0);
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM public.plans
WHERE id = :'plan_id'::UUID
  AND user_id = :'user_id'::UUID;`,
          { plan_id: planId, user_id: planWriterFirstUserId },
        ),
      ).toBe('1');
    } finally {
      await holder.release(false);
      await beginAttempt;
    }
  });

  it('lets a direct Record writer wait behind begin without deadlocking', async () => {
    const recordId = crypto.randomUUID();
    const holder = await holdTransaction(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ).replace('COMMIT;', ''),
      { user_id: recordGateFirstUserId },
      'account-gate-record-gate-holder',
    );
    const waiterName = 'account-gate-record-gate-writer';
    const recordAttempt = runSqlAsync(
      directTimeblockInsert('records'),
      {
        end_at: '2020-01-01T01:00:00Z',
        start_at: '2020-01-01T00:00:00Z',
        timeblock_id: recordId,
        title: 'Record writer after account deletion begin',
        user_id: recordGateFirstUserId,
      },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const recordResult = await recordAttempt;
      expect(recordResult.code).toBe(0);
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM public.records
WHERE id = :'record_id'::UUID
  AND user_id = :'user_id'::UUID;`,
          { record_id: recordId, user_id: recordGateFirstUserId },
        ),
      ).toBe('1');
    } finally {
      await holder.release(false);
      await recordAttempt;
    }
  });

  it('lets a direct Plan writer wait behind begin without deadlocking', async () => {
    const planId = crypto.randomUUID();
    const holder = await holdTransaction(
      serviceRoleTransaction(
        `SELECT *
FROM public.begin_account_deletion_v1(:'user_id'::UUID);`,
      ).replace('COMMIT;', ''),
      { user_id: planGateFirstUserId },
      'account-gate-plan-gate-holder',
    );
    const waiterName = 'account-gate-plan-gate-writer';
    const planAttempt = runSqlAsync(
      directTimeblockInsert('plans'),
      {
        end_at: '2041-01-01T01:00:00Z',
        start_at: '2041-01-01T00:00:00Z',
        timeblock_id: planId,
        title: 'Plan writer after account deletion begin',
        user_id: planGateFirstUserId,
      },
      waiterName,
    );

    try {
      await waitForApplicationLock(waiterName);
      const holderResult = await holder.release();
      expect(holderResult.code).toBe(0);

      const planResult = await planAttempt;
      expect(planResult.code).toBe(0);
      expect(
        ownerSql(
          `SELECT pg_catalog.count(*)::TEXT
FROM public.plans
WHERE id = :'plan_id'::UUID
  AND user_id = :'user_id'::UUID;`,
          { plan_id: planId, user_id: planGateFirstUserId },
        ),
      ).toBe('1');
    } finally {
      await holder.release(false);
      await planAttempt;
    }
  });
});
