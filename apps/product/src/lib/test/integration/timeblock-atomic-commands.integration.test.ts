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
const email = `timeblock-commands-${userId}@example.com`;
const password = 'test-password-123';
const dbNull = null as never;

type PlanRow = Database['public']['Tables']['plans']['Row'];
type RecordRow = Database['public']['Tables']['records']['Row'];

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function sameMillisecondDifferentVersion(version: string): string {
  const normalized = version.endsWith('Z') ? version.replace(/Z$/, '+00:00') : version;
  const match = normalized.match(/^(.*?)(?:\.(\d{1,6}))?([+-]\d{2}:?\d{2})$/);
  if (!match) throw new Error(`Unexpected timestamptz: ${version}`);

  const [, whole, fraction = '', offset] = match;
  const micros = fraction.padEnd(6, '0');
  const finalDigit = micros.at(-1) === '9' ? '8' : '9';
  return `${whole}.${micros.slice(0, -1)}${finalDigit}${offset}`;
}

async function createPlan(input: {
  title: string;
  startAt: string;
  endAt: string;
  source?: 'manual' | 'api';
}): Promise<PlanRow> {
  const { data, error } = await admin
    .rpc('create_plan_command_v1', {
      p_user_id: userId,
      p_title: input.title,
      p_note: dbNull,
      p_external_calendar_event_id: dbNull,
      p_source: input.source ?? 'manual',
      p_start_at: input.startAt,
      p_end_at: input.endAt,
    })
    .single();
  if (error) throw error;
  return data;
}

async function createRecord(input: {
  title: string;
  startAt: string;
  endAt: string;
  source?: 'manual' | 'api';
  planId?: string | null;
}): Promise<RecordRow> {
  const { data, error } = await admin
    .rpc('create_record_command_v1', {
      p_user_id: userId,
      p_title: input.title,
      p_note: dbNull,
      p_plan_id: (input.planId ?? null) as never,
      p_external_calendar_event_id: dbNull,
      p_source: input.source ?? 'manual',
      p_start_at: input.startAt,
      p_end_at: input.endAt,
    })
    .single();
  if (error) throw error;
  return data;
}

function planUpdateArgs(plan: PlanRow, title: string, expectedUpdatedAt = plan.updated_at) {
  return {
    p_user_id: userId,
    p_plan_id: plan.id,
    p_expected_updated_at: expectedUpdatedAt,
    p_title: title,
    p_note: plan.note as never,
    p_external_calendar_event_id: plan.external_calendar_event_id as never,
    p_start_at: plan.start_at,
    p_end_at: plan.end_at,
  };
}

function recordUpdateArgs(record: RecordRow, title: string, expectedUpdatedAt = record.updated_at) {
  return {
    p_user_id: userId,
    p_record_id: record.id,
    p_expected_updated_at: expectedUpdatedAt,
    p_title: title,
    p_note: record.note as never,
    p_plan_id: record.plan_id as never,
    p_external_calendar_event_id: record.external_calendar_event_id as never,
    p_start_at: record.start_at,
    p_end_at: record.end_at,
  };
}

describe.skipIf(!RUN_LOCAL)('atomic Plan and Record command boundary', () => {
  beforeAll(async () => {
    const { error } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;

    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  afterEach(async () => {
    await admin.from('records').delete().eq('user_id', userId);
    await admin.from('plans').delete().eq('user_id', userId);
  });

  afterAll(async () => {
    await userClient.auth.signOut();
    await admin.auth.admin.deleteUser(userId);
  });

  it('does not expose service-owned commands to authenticated clients', async () => {
    const { error } = await userClient.rpc('create_plan_command_v1', {
      p_user_id: userId,
      p_title: 'Forbidden direct RPC',
      p_note: dbNull,
      p_external_calendar_event_id: dbNull,
      p_source: 'manual',
      p_start_at: at(60 * 60_000),
      p_end_at: at(2 * 60 * 60_000),
    });

    expect(error?.code).toBe('42501');

    const { error: confirmError } = await userClient.rpc('confirm_day_plans_command_v1', {
      p_user_id: userId,
      p_start_at: at(-24 * 60 * 60_000),
      p_end_at: at(24 * 60 * 60_000),
      p_confirmed_at: at(0),
    });
    expect(confirmError?.code).toBe('42501');
  });

  it('rejects confirm-day ranges longer than 26 hours', async () => {
    const { error } = await admin.rpc('confirm_day_plans_command_v1', {
      p_user_id: userId,
      p_start_at: '2026-07-01T00:00:00.000Z',
      p_end_at: '2026-07-02T02:00:00.001Z',
    });

    expect(error?.code).toBe('22023');
  });

  it('serializes concurrent Plan updates with exact compare-and-swap', async () => {
    const plan = await createPlan({
      title: 'Original',
      startAt: at(60 * 60_000),
      endAt: at(2 * 60 * 60_000),
    });

    const attempts = await Promise.all([
      admin.rpc('update_plan_command_v1', planUpdateArgs(plan, 'Writer A')).single(),
      admin.rpc('update_plan_command_v1', planUpdateArgs(plan, 'Writer B')).single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(attempts.filter(({ error }) => error?.code === 'DT002')).toHaveLength(1);

    const { data: persisted, error } = await admin
      .from('plans')
      .select('title, updated_at')
      .eq('id', plan.id)
      .single();
    expect(error).toBeNull();
    expect(['Writer A', 'Writer B']).toContain(persisted?.title);
    expect(persisted?.updated_at).not.toBe(plan.updated_at);
  });

  it('allows only one of a same-version Plan update and delete', async () => {
    const plan = await createPlan({
      title: 'Update or delete',
      startAt: at(8 * 60 * 60_000),
      endAt: at(9 * 60 * 60_000),
    });

    const attempts = await Promise.all([
      admin.rpc('update_plan_command_v1', planUpdateArgs(plan, 'Updated')).single(),
      admin
        .rpc('delete_plan_command_v1', {
          p_user_id: userId,
          p_plan_id: plan.id,
          p_expected_updated_at: plan.updated_at,
        })
        .single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(
      attempts.filter(({ error }) => ['DT001', 'DT002'].includes(error?.code ?? '')),
    ).toHaveLength(1);
  });

  it('serializes concurrent Record updates with exact compare-and-swap', async () => {
    const record = await createRecord({
      title: 'Original record',
      startAt: at(-4 * 60 * 60_000),
      endAt: at(-3 * 60 * 60_000),
    });

    const attempts = await Promise.all([
      admin.rpc('update_record_command_v1', recordUpdateArgs(record, 'Record A')).single(),
      admin.rpc('update_record_command_v1', recordUpdateArgs(record, 'Record B')).single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(attempts.filter(({ error }) => error?.code === 'DT002')).toHaveLength(1);
  });

  it('does not collapse sub-millisecond versions through JavaScript Date', async () => {
    const plan = await createPlan({
      title: 'Precise version',
      startAt: at(3 * 60 * 60_000),
      endAt: at(4 * 60 * 60_000),
    });
    const wrongVersion = sameMillisecondDifferentVersion(plan.updated_at);

    expect(new Date(wrongVersion).getTime()).toBe(new Date(plan.updated_at).getTime());
    const { error } = await admin
      .rpc('update_plan_command_v1', planUpdateArgs(plan, 'Must conflict', wrongVersion))
      .single();

    expect(error?.code).toBe('DT002');
  });

  it('lets only one of simultaneous UI and MCP Plan creates occupy a range', async () => {
    const startAt = at(5 * 60 * 60_000);
    const endAt = at(6 * 60 * 60_000);
    const base = {
      p_user_id: userId,
      p_note: dbNull,
      p_external_calendar_event_id: dbNull,
      p_start_at: startAt,
      p_end_at: endAt,
    };

    const attempts = await Promise.all([
      admin.rpc('create_plan_command_v1', { ...base, p_title: 'UI', p_source: 'manual' }).single(),
      admin.rpc('create_plan_command_v1', { ...base, p_title: 'MCP', p_source: 'api' }).single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(
      attempts.filter(({ error }) => ['23P01', '40P01'].includes(error?.code ?? '')),
    ).toHaveLength(1);

    const adjacent = await createPlan({
      title: 'Adjacent',
      startAt: endAt,
      endAt: at(7 * 60 * 60_000),
      source: 'api',
    });
    expect(new Date(adjacent.start_at).getTime()).toBe(new Date(endAt).getTime());
  });

  // #1985: useConvertGhostEvent はタップのたびに ghost の同じ start_at/end_at を複製して
  // create_plan_command_v1 / create_record_command_v1 を呼ぶ。external_calendar_event_id に
  // 専用の unique 制約は無いため、二重変換の防止は plans_no_overlap（時間帯 EXCLUDE 制約）の
  // 副作用に過ぎない（risk-reviewer 指摘）。この副作用が実際に効くことをここで固定する。
  it('lets only one of two simultaneous conversions of the same ghost create a Plan', async () => {
    const startAt = at(8 * 60 * 60_000);
    const endAt = at(9 * 60 * 60_000);

    const { data: ghost, error: ghostError } = await admin
      .from('external_calendar_events')
      .insert({
        user_id: userId,
        provider: 'google',
        provider_calendar_id: 'primary',
        provider_event_id: `evt-double-convert-${crypto.randomUUID()}`,
        title: 'Ghost double-convert race',
        start_at: startAt,
        end_at: endAt,
        status: 'confirmed',
        last_synced_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (ghostError) throw ghostError;

    try {
      const base = {
        p_user_id: userId,
        p_note: dbNull,
        p_external_calendar_event_id: ghost.id,
        p_start_at: startAt,
        p_end_at: endAt,
      };

      const attempts = await Promise.all([
        admin
          .rpc('create_plan_command_v1', {
            ...base,
            p_title: 'Ghost title',
            p_source: 'external_calendar',
          })
          .single(),
        admin
          .rpc('create_plan_command_v1', {
            ...base,
            p_title: 'Ghost title',
            p_source: 'external_calendar',
          })
          .single(),
      ]);

      expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
      expect(
        attempts.filter(({ error }) => ['23P01', '40P01'].includes(error?.code ?? '')),
      ).toHaveLength(1);
    } finally {
      await admin.from('external_calendar_events').delete().eq('id', ghost.id);
    }
  });

  it('allows either Plan restore or an overlapping create, never both', async () => {
    const startAt = at(10 * 60 * 60_000);
    const endAt = at(11 * 60 * 60_000);
    const plan = await createPlan({ title: 'Plan trash candidate', startAt, endAt });
    const { data: deleted, error: deleteError } = await admin
      .rpc('delete_plan_command_v1', {
        p_user_id: userId,
        p_plan_id: plan.id,
        p_expected_updated_at: plan.updated_at,
      })
      .single();
    expect(deleteError).toBeNull();

    const attempts = await Promise.all([
      admin
        .rpc('restore_plan_command_v1', {
          p_user_id: userId,
          p_plan_id: plan.id,
          p_expected_updated_at: deleted!.updated_at,
        })
        .single(),
      admin
        .rpc('create_plan_command_v1', {
          p_user_id: userId,
          p_title: 'Competing Plan',
          p_note: dbNull,
          p_external_calendar_event_id: dbNull,
          p_source: 'api',
          p_start_at: startAt,
          p_end_at: endAt,
        })
        .single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(
      attempts.filter(({ error }) => ['23P01', '40P01'].includes(error?.code ?? '')),
    ).toHaveLength(1);
  });

  it('lets only one of simultaneous UI and MCP Record creates occupy a range', async () => {
    const startAt = at(-6 * 60 * 60_000);
    const endAt = at(-5 * 60 * 60_000);
    const base = {
      p_user_id: userId,
      p_note: dbNull,
      p_plan_id: dbNull,
      p_external_calendar_event_id: dbNull,
      p_start_at: startAt,
      p_end_at: endAt,
    };

    const attempts = await Promise.all([
      admin
        .rpc('create_record_command_v1', { ...base, p_title: 'UI', p_source: 'manual' })
        .single(),
      admin.rpc('create_record_command_v1', { ...base, p_title: 'MCP', p_source: 'api' }).single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(
      attempts.filter(({ error }) => ['23P01', '40P01'].includes(error?.code ?? '')),
    ).toHaveLength(1);

    const adjacent = await createRecord({
      title: 'Adjacent',
      startAt: endAt,
      endAt: at(-4 * 60 * 60_000),
      source: 'api',
    });
    expect(new Date(adjacent.start_at).getTime()).toBe(new Date(endAt).getTime());
  });

  it('allows a Plan and Record to occupy the same time across separate lanes', async () => {
    const sharedStartAt = at(-60 * 60_000);
    const plan = await createPlan({
      title: 'Cross-lane Plan',
      startAt: sharedStartAt,
      endAt: at(60 * 60_000),
      source: 'api',
    });
    const record = await createRecord({
      title: 'Cross-lane Record',
      startAt: sharedStartAt,
      endAt: at(-1_000),
      source: 'api',
    });

    expect(plan.id).not.toBe(record.id);
  });

  it('distinguishes a future Record from a Record linked to a future Plan', async () => {
    const plan = await createPlan({
      title: 'Future link target',
      startAt: at(60 * 60_000),
      endAt: at(2 * 60 * 60_000),
    });
    const base = {
      p_user_id: userId,
      p_title: 'Record error contract',
      p_note: dbNull,
      p_external_calendar_event_id: dbNull,
      p_source: 'api',
    };

    const { error: futureRecordError } = await admin.rpc('create_record_command_v1', {
      ...base,
      p_plan_id: dbNull,
      p_start_at: at(60 * 60_000),
      p_end_at: at(2 * 60 * 60_000),
    });
    const { error: futurePlanError } = await admin.rpc('create_record_command_v1', {
      ...base,
      p_plan_id: plan.id,
      p_start_at: at(-2 * 60 * 60_000),
      p_end_at: at(-60 * 60_000),
    });
    const { error: directFuturePlanError } = await admin.from('records').insert({
      user_id: userId,
      title: 'Legacy direct writer',
      plan_id: plan.id,
      source: 'api',
      start_at: at(-4 * 60 * 60_000),
      end_at: at(-3 * 60 * 60_000),
    });
    const unlinked = await createRecord({
      title: 'Legacy direct update',
      startAt: at(-6 * 60 * 60_000),
      endAt: at(-5 * 60 * 60_000),
      source: 'api',
    });
    const { error: directRelinkError } = await admin
      .from('records')
      .update({ plan_id: plan.id })
      .eq('id', unlinked.id);

    expect(futureRecordError?.code).toBe('DT005');
    expect(futurePlanError?.code).toBe('DT013');
    expect(directFuturePlanError?.code).toBe('DT013');
    expect(directRelinkError?.code).toBe('DT013');
  });

  it('allows either Record restore or overlapping create, never both', async () => {
    const startAt = at(-9 * 60 * 60_000);
    const endAt = at(-8 * 60 * 60_000);
    const record = await createRecord({ title: 'Trash candidate', startAt, endAt });
    const { data: deleted, error: deleteError } = await admin
      .rpc('delete_record_command_v1', {
        p_user_id: userId,
        p_record_id: record.id,
        p_expected_updated_at: record.updated_at,
      })
      .single();
    expect(deleteError).toBeNull();

    const attempts = await Promise.all([
      admin
        .rpc('restore_record_command_v1', {
          p_user_id: userId,
          p_record_id: record.id,
          p_expected_updated_at: deleted!.updated_at,
        })
        .single(),
      admin
        .rpc('create_record_command_v1', {
          p_user_id: userId,
          p_title: 'Competing create',
          p_note: dbNull,
          p_plan_id: dbNull,
          p_external_calendar_event_id: dbNull,
          p_source: 'api',
          p_start_at: startAt,
          p_end_at: endAt,
        })
        .single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(
      attempts.filter(({ error }) => ['23P01', '40P01'].includes(error?.code ?? '')),
    ).toHaveLength(1);
  });

  it('serializes Plan skip against linked Record creation', async () => {
    const plan = await createPlan({
      title: 'Nearly complete',
      startAt: at(-2_000),
      endAt: at(1_500),
    });
    await new Promise((resolve) => setTimeout(resolve, 1_700));

    const attempts = await Promise.all([
      admin
        .rpc('set_plan_skipped_command_v1', {
          p_user_id: userId,
          p_plan_id: plan.id,
          p_expected_updated_at: plan.updated_at,
          p_skipped: true,
        })
        .single(),
      admin
        .rpc('record_plan_command_v1', {
          p_user_id: userId,
          p_plan_id: plan.id,
          p_expected_updated_at: plan.updated_at,
        })
        .single(),
    ]);

    expect(attempts.filter(({ error }) => error === null)).toHaveLength(1);
    expect(
      attempts.filter(({ error }) => ['DT008', 'DT011'].includes(error?.code ?? '')),
    ).toHaveLength(1);

    const [{ data: persistedPlan }, { data: linkedRecords }] = await Promise.all([
      admin.from('plans').select('skipped_at').eq('id', plan.id).single(),
      admin.from('records').select('id').eq('plan_id', plan.id).is('deleted_at', null),
    ]);
    expect(Boolean(persistedPlan?.skipped_at) && (linkedRecords?.length ?? 0) > 0).toBe(false);
  });

  it('serializes confirm-day against one-tap Plan recording', async () => {
    const plan = await createPlan({
      title: 'Confirm day race',
      startAt: at(-2_000),
      endAt: at(1_500),
    });
    await new Promise((resolve) => setTimeout(resolve, 1_700));

    const attempts = await Promise.all([
      admin.rpc('confirm_day_plans_command_v1', {
        p_user_id: userId,
        p_start_at: at(-12 * 60 * 60_000),
        p_end_at: at(12 * 60 * 60_000),
        p_confirmed_at: at(0),
      }),
      admin
        .rpc('record_plan_command_v1', {
          p_user_id: userId,
          p_plan_id: plan.id,
          p_expected_updated_at: plan.updated_at,
        })
        .single(),
    ]);

    expect(attempts.every(({ error }) => error === null || error.code === 'DT011')).toBe(true);
    expect(attempts.some(({ error }) => error === null)).toBe(true);

    const { data: linkedRecords, error } = await admin
      .from('records')
      .select('id')
      .eq('plan_id', plan.id)
      .is('deleted_at', null);
    expect(error).toBeNull();
    expect(linkedRecords).toHaveLength(1);
  });

  it('rejects restoring a linked Record after its Plan is skipped', async () => {
    const plan = await createPlan({
      title: 'Restore invariant',
      startAt: at(-2_000),
      endAt: at(1_500),
    });
    await new Promise((resolve) => setTimeout(resolve, 1_700));

    const { error: genericFromPlanError } = await admin.rpc('create_record_command_v1', {
      p_user_id: userId,
      p_title: 'Forbidden generic from_plan',
      p_note: dbNull,
      p_plan_id: plan.id,
      p_external_calendar_event_id: dbNull,
      p_source: 'from_plan',
      p_start_at: plan.start_at,
      p_end_at: plan.end_at,
    });
    expect(genericFromPlanError?.code).toBe('DT012');

    const { error: nullSkipError } = await admin.rpc('set_plan_skipped_command_v1', {
      p_user_id: userId,
      p_plan_id: plan.id,
      p_expected_updated_at: plan.updated_at,
      p_skipped: dbNull,
    });
    expect(nullSkipError?.code).toBe('22023');

    const { data: record, error: recordError } = await admin
      .rpc('record_plan_command_v1', {
        p_user_id: userId,
        p_plan_id: plan.id,
        p_expected_updated_at: plan.updated_at,
      })
      .single();
    expect(recordError).toBeNull();

    const { data: deleted, error: deleteError } = await admin
      .rpc('delete_record_command_v1', {
        p_user_id: userId,
        p_record_id: record!.id,
        p_expected_updated_at: record!.updated_at,
      })
      .single();
    expect(deleteError).toBeNull();

    const { error: skipError } = await admin
      .rpc('set_plan_skipped_command_v1', {
        p_user_id: userId,
        p_plan_id: plan.id,
        p_expected_updated_at: plan.updated_at,
        p_skipped: true,
      })
      .single();
    expect(skipError).toBeNull();

    const { error: restoreError } = await admin
      .rpc('restore_record_command_v1', {
        p_user_id: userId,
        p_record_id: record!.id,
        p_expected_updated_at: deleted!.updated_at,
      })
      .single();
    expect(restoreError?.code).toBe('DT008');
  });

  it('keeps auto-migrated Records immutable for service-role commands', async () => {
    const { data: record, error: insertError } = await admin
      .from('records')
      .insert({
        user_id: userId,
        title: 'Legacy import',
        source: 'auto_migrated',
        start_at: at(-12 * 60 * 60_000),
        end_at: at(-11 * 60 * 60_000),
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { error: updateError } = await admin
      .rpc('update_record_command_v1', recordUpdateArgs(record!, 'Forbidden update'))
      .single();
    expect(updateError?.code).toBe('DT009');

    const { error: deleteError } = await admin
      .rpc('delete_record_command_v1', {
        p_user_id: userId,
        p_record_id: record!.id,
        p_expected_updated_at: record!.updated_at,
      })
      .single();
    expect(deleteError?.code).toBe('DT009');

    const { data: tombstone, error: tombstoneError } = await admin
      .from('records')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', record!.id)
      .select()
      .single();
    expect(tombstoneError).toBeNull();

    const { error: restoreError } = await admin
      .rpc('restore_record_command_v1', {
        p_user_id: userId,
        p_record_id: record!.id,
        p_expected_updated_at: tombstone!.updated_at,
      })
      .single();
    expect(restoreError?.code).toBe('DT009');
  });
});
