import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';

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
const foreignUserId = crypto.randomUUID();
const email = `purge-serialization-${userId}@example.com`;
const foreignEmail = `purge-serialization-${foreignUserId}@example.com`;
const password = 'test-password-123';
const dbNull = null as never;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
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

async function holdServiceRoleTransaction(
  sql: string,
  variables: Record<string, string>,
): Promise<{ release: (commit?: boolean) => Promise<void> }> {
  const process = spawn('psql', psqlArgs(variables), { env: psqlEnv() });
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
  process.stdin.write(
    `BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
${sql}
SELECT 'LOCKED';
`,
  );

  const deadline = Date.now() + 5_000;
  while (!stdout.includes('LOCKED')) {
    if (process.exitCode !== null) throw new Error(`Lock holder exited: ${stderr}`);
    if (Date.now() >= deadline) throw new Error(`Timed out acquiring user lock: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return {
    release: async (commit = true) => {
      if (process.exitCode !== null) return;
      process.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
      await once(process, 'close');
    },
  };
}

async function holdAuthenticatedTagInsert(): Promise<{
  release: (commit?: boolean) => Promise<void>;
}> {
  const process = spawn('psql', psqlArgs({ user_id: userId, tag_id: crypto.randomUUID() }), {
    env: psqlEnv(),
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
  process.stdin.write(
    `BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object('role', 'authenticated', 'sub', :'user_id')::TEXT,
  true
);
INSERT INTO public.tags (id, user_id, name, sort_order)
VALUES (:'tag_id'::UUID, :'user_id'::UUID, 'Concurrent tag', 0);
SELECT 'LOCKED';
`,
  );

  const deadline = Date.now() + 5_000;
  while (!stdout.includes('LOCKED')) {
    if (process.exitCode !== null) throw new Error(`Tag writer exited: ${stderr}`);
    if (Date.now() >= deadline) throw new Error(`Timed out acquiring tag writer lock: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return {
    release: async (commit = true) => {
      if (process.exitCode !== null) return;
      process.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
      await once(process, 'close');
    },
  };
}

async function waitForAdvisoryWaiter(targetUserId = userId): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
    throw new Error('Expected a UUID advisory-lock identity');
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiterCount = await new Promise<number>((resolve, reject) => {
      const process = spawn(
        'psql',
        [
          ...psqlArgs(),
          '-c',
          `WITH expected AS (
  SELECT pg_catalog.hashtextextended(
    'dayopt:timeblock-user-write:${targetUserId}',
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
      process.stdout.setEncoding('utf8');
      process.stderr.setEncoding('utf8');
      process.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      process.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      process.on('close', (code) => {
        if (code === 0) resolve(Number(stdout.trim()));
        else reject(new Error(stderr));
      });
    });
    if (waiterCount > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for advisory lock contention');
}

async function runPsql(sql: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn('psql', [...psqlArgs(), '-c', sql], { env: psqlEnv() });
    let stderr = '';
    process.stderr.setEncoding('utf8');
    process.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    process.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr));
    });
  });
}

async function createPlan(targetUserId = userId, title = 'Plan') {
  return admin
    .rpc('create_plan_command_v1', {
      p_user_id: targetUserId,
      p_title: title,
      p_note: dbNull,
      p_tag_id: dbNull,
      p_external_calendar_event_id: dbNull,
      p_source: 'manual',
      p_start_at: at(60 * 60_000),
      p_end_at: at(2 * 60 * 60_000),
    })
    .single();
}

describe.skipIf(!RUN_LOCAL)('atomic user-data purge serialization', () => {
  beforeAll(async () => {
    for (const [id, targetEmail] of [
      [userId, email],
      [foreignUserId, foreignEmail],
    ] as const) {
      const { error } = await admin.auth.admin.createUser({
        id,
        email: targetEmail,
        password,
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  afterEach(async () => {
    await admin.rpc('delete_all_user_data_command_v2', { p_user_id: userId });
    await admin.rpc('delete_all_user_data_command_v2', { p_user_id: foreignUserId });
  });

  afterAll(async () => {
    await userClient.auth.signOut();
    await admin.auth.admin.deleteUser(userId);
    await admin.auth.admin.deleteUser(foreignUserId);
  });

  it('does not expose purge commands to authenticated clients', async () => {
    const [{ error: blocksError }, { error: allError }] = await Promise.all([
      userClient.rpc('delete_user_timeblocks_command_v2', { p_user_id: userId }),
      userClient.rpc('delete_all_user_data_command_v2', { p_user_id: userId }),
    ]);

    expect(blocksError?.code).toBe('42501');
    expect(allError?.code).toBe('42501');
  });

  it('exposes only the post-serialization command names to service-role callers', async () => {
    const [{ error: blocksError }, { error: allError }, { error: tagsError }] = await Promise.all([
      admin.rpc('delete_user_timeblocks_command_v1', { p_user_id: userId }),
      admin.rpc('delete_all_user_data_command_v1', { p_user_id: userId }),
      admin.rpc('delete_tags_with_timeblocks_command_v2', {
        p_user_id: userId,
        p_tag_ids: [],
        p_strategy: 'require_empty',
        p_target_tag_id: dbNull,
        p_promote_children: false,
      }),
    ]);

    expect(blocksError?.code).toBe('42501');
    expect(allError?.code).toBe('42501');
    expect(tagsError?.code).toBe('42501');
  });

  it('writer-first schedule commits Plan and Record before purge, leaving no blocks', async () => {
    const holder = await holdServiceRoleTransaction(
      `SELECT public.create_plan_command_v1(
  :'user_id'::UUID, 'Writer first Plan', NULL, NULL, NULL, 'manual',
  :'plan_start'::TIMESTAMPTZ, :'plan_end'::TIMESTAMPTZ
);
SELECT public.create_record_command_v1(
  :'user_id'::UUID, 'Writer first Record', NULL, NULL, NULL, NULL, 'manual',
  :'record_start'::TIMESTAMPTZ, :'record_end'::TIMESTAMPTZ
);`,
      {
        user_id: userId,
        plan_start: at(3 * 60 * 60_000),
        plan_end: at(4 * 60 * 60_000),
        record_start: at(-4 * 60 * 60_000),
        record_end: at(-3 * 60 * 60_000),
      },
    );

    const purge = Promise.resolve(
      admin.rpc('delete_user_timeblocks_command_v2', { p_user_id: userId }),
    );
    try {
      await waitForAdvisoryWaiter();
      await holder.release();

      const { data: deletedCount, error } = await purge;
      expect(error).toBeNull();
      expect(deletedCount).toBe(2);

      const [{ count: planCount }, { count: recordCount }] = await Promise.all([
        admin.from('plans').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        admin.from('records').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      expect(planCount).toBe(0);
      expect(recordCount).toBe(0);
    } finally {
      await holder.release(false);
    }
  });

  it('purge-first schedule lets the later Plan writer succeed', async () => {
    const holder = await holdServiceRoleTransaction(
      "SELECT public.delete_user_timeblocks_command_v2(:'user_id'::UUID);",
      { user_id: userId },
    );

    const writer = createPlan(userId, 'After purge');
    try {
      await waitForAdvisoryWaiter();
      await holder.release();

      const { data: plan, error } = await writer;
      expect(error).toBeNull();
      expect(plan?.title).toBe('After purge');
    } finally {
      await holder.release(false);
    }
  });

  it('one user purge does not block another user writer', async () => {
    const holder = await holdServiceRoleTransaction(
      "SELECT public.delete_user_timeblocks_command_v2(:'user_id'::UUID);",
      { user_id: userId },
    );

    try {
      const { data: plan, error } = await createPlan(foreignUserId, 'Other user');
      expect(error).toBeNull();
      expect(plan?.user_id).toBe(foreignUserId);
    } finally {
      await holder.release(false);
    }
  });

  it('authenticated tag writer commits before full purge and is deleted', async () => {
    const holder = await holdAuthenticatedTagInsert();
    const purge = Promise.resolve(
      admin.rpc('delete_all_user_data_command_v2', { p_user_id: userId }),
    );
    try {
      await waitForAdvisoryWaiter();
      await holder.release();

      const { data: deleted, error } = await purge;
      expect(error).toBeNull();
      expect(deleted).toBe(true);

      const { count } = await admin
        .from('tags')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      expect(count).toBe(0);
    } finally {
      await holder.release(false);
    }
  });

  it('require_empty revalidates intent and child promotion commits with tag deletion', async () => {
    const rootId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const { error: tagError } = await admin.from('tags').insert([
      { id: rootId, user_id: userId, name: 'Root', sort_order: 2 },
      { id: sourceId, user_id: userId, name: 'Source', sort_order: 3 },
      {
        id: childId,
        user_id: userId,
        name: 'Child',
        parent_id: sourceId,
        sort_order: 0,
      },
    ]);
    expect(tagError).toBeNull();

    const { data: plan, error: planError } = await admin
      .rpc('create_plan_command_v1', {
        p_user_id: userId,
        p_title: 'Tagged Plan',
        p_note: dbNull,
        p_tag_id: sourceId,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(5 * 60 * 60_000),
        p_end_at: at(6 * 60 * 60_000),
      })
      .single();
    expect(planError).toBeNull();

    const { error: requireEmptyError } = await admin.rpc('delete_tags_with_timeblocks_command_v3', {
      p_user_id: userId,
      p_tag_ids: [sourceId],
      p_strategy: 'require_empty',
      p_target_tag_id: dbNull,
      p_promote_children: true,
    });
    expect(requireEmptyError?.code).toBe('DT014');

    const { data: deletedCount, error: deleteError } = await admin.rpc(
      'delete_tags_with_timeblocks_command_v3',
      {
        p_user_id: userId,
        p_tag_ids: [sourceId],
        p_strategy: 'delete_blocks',
        p_target_tag_id: dbNull,
        p_promote_children: true,
      },
    );
    expect(deleteError).toBeNull();
    expect(deletedCount).toBe(1);

    const [{ data: child }, { data: source }, { data: persistedPlan }] = await Promise.all([
      admin.from('tags').select('parent_id, sort_order').eq('id', childId).single(),
      admin.from('tags').select('id').eq('id', sourceId).maybeSingle(),
      admin.from('plans').select('id').eq('id', plan!.id).maybeSingle(),
    ]);
    expect(child?.parent_id).toBeNull();
    expect(child?.sort_order).toBeGreaterThan(3);
    expect(source).toBeNull();
    expect(persistedPlan).toBeNull();
  });

  it('treats trash-only associations as empty and removes them with the tag', async () => {
    const tagId = crypto.randomUUID();
    const { error: tagError } = await admin.from('tags').insert({
      id: tagId,
      user_id: userId,
      name: 'Trash only',
      sort_order: 0,
    });
    expect(tagError).toBeNull();

    const { data: plan, error: planError } = await admin
      .rpc('create_plan_command_v1', {
        p_user_id: userId,
        p_title: 'Trash-only Plan',
        p_note: dbNull,
        p_tag_id: tagId,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(7 * 60 * 60_000),
        p_end_at: at(8 * 60 * 60_000),
      })
      .single();
    expect(planError).toBeNull();

    const { data: record, error: recordError } = await admin
      .rpc('create_record_command_v1', {
        p_user_id: userId,
        p_title: 'Trash-only Record',
        p_note: dbNull,
        p_tag_id: tagId,
        p_plan_id: dbNull,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(-8 * 60 * 60_000),
        p_end_at: at(-7 * 60 * 60_000),
      })
      .single();
    expect(recordError).toBeNull();

    const [{ error: planDeleteError }, { error: recordDeleteError }] = await Promise.all([
      admin.rpc('delete_plan_command_v1', {
        p_user_id: userId,
        p_plan_id: plan!.id,
        p_expected_updated_at: plan!.updated_at,
      }),
      admin.rpc('delete_record_command_v1', {
        p_user_id: userId,
        p_record_id: record!.id,
        p_expected_updated_at: record!.updated_at,
      }),
    ]);
    expect(planDeleteError).toBeNull();
    expect(recordDeleteError).toBeNull();

    const { data: deletedCount, error: deleteError } = await admin.rpc(
      'delete_tags_with_timeblocks_command_v3',
      {
        p_user_id: userId,
        p_tag_ids: [tagId],
        p_strategy: 'require_empty',
        p_target_tag_id: dbNull,
        p_promote_children: false,
      },
    );
    expect(deleteError).toBeNull();
    expect(deletedCount).toBe(1);

    const [{ data: tag }, { data: persistedPlan }, { data: persistedRecord }] = await Promise.all([
      admin.from('tags').select('id').eq('id', tagId).maybeSingle(),
      admin.from('plans').select('id').eq('id', plan!.id).maybeSingle(),
      admin.from('records').select('id').eq('id', record!.id).maybeSingle(),
    ]);
    expect(tag).toBeNull();
    expect(persistedPlan).toBeNull();
    expect(persistedRecord).toBeNull();
  });

  it('rolls back Record deletion when a later Plan delete fails', async () => {
    const { data: plan, error: planError } = await createPlan(userId, 'Rollback Plan');
    expect(planError).toBeNull();
    const { data: record, error: recordError } = await admin
      .rpc('create_record_command_v1', {
        p_user_id: userId,
        p_title: 'Rollback Record',
        p_note: dbNull,
        p_tag_id: dbNull,
        p_plan_id: dbNull,
        p_external_calendar_event_id: dbNull,
        p_source: 'manual',
        p_start_at: at(-2 * 60 * 60_000),
        p_end_at: at(-60 * 60_000),
      })
      .single();
    expect(recordError).toBeNull();

    await runPsql(`
CREATE OR REPLACE FUNCTION private.fail_test_plan_purge_v1()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Injected purge failure' USING ERRCODE = 'P0001';
END;
$$;
CREATE TRIGGER trigger_fail_test_plan_purge
  BEFORE DELETE ON public.plans
  FOR EACH STATEMENT EXECUTE FUNCTION private.fail_test_plan_purge_v1();
`);

    try {
      const { error } = await admin.rpc('delete_user_timeblocks_command_v2', {
        p_user_id: userId,
      });
      expect(error?.code).toBe('P0001');

      const [{ data: persistedPlan }, { data: persistedRecord }] = await Promise.all([
        admin.from('plans').select('id').eq('id', plan!.id).single(),
        admin.from('records').select('id').eq('id', record!.id).single(),
      ]);
      expect(persistedPlan?.id).toBe(plan!.id);
      expect(persistedRecord?.id).toBe(record!.id);
    } finally {
      await runPsql(`
DROP TRIGGER IF EXISTS trigger_fail_test_plan_purge ON public.plans;
DROP FUNCTION IF EXISTS private.fail_test_plan_purge_v1();
`);
    }
  });
});
