import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTimeblockTrashReadClient } from '@/features/timeblock/server/service-index';
import type { Database } from '@/lib/database';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ownerId = crypto.randomUUID();
const foreignUserId = crypto.randomUUID();
const ownerPlanId = crypto.randomUUID();
const activePlanId = crypto.randomUUID();
const foreignPlanId = crypto.randomUUID();
const ownerRecordId = crypto.randomUUID();
const activeRecordId = crypto.randomUUID();
const foreignRecordId = crypto.randomUUID();
const deletedAt = new Date().toISOString();
const HOUR_MS = 60 * 60_000;

describe.skipIf(!RUN_LOCAL)('MCP trash read tenant boundary', () => {
  beforeAll(async () => {
    for (const [id, label] of [
      [ownerId, 'owner'],
      [foreignUserId, 'foreign'],
    ] as const) {
      const { error } = await admin.auth.admin.createUser({
        id,
        email: `mcp-trash-${label}-${id}@example.com`,
        password: 'test-password-123',
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { error: planError } = await admin.from('plans').insert([
      {
        id: ownerPlanId,
        user_id: ownerId,
        title: 'Owner deleted Plan',
        start_at: at(HOUR_MS),
        end_at: at(2 * HOUR_MS),
        deleted_at: deletedAt,
      },
      {
        id: activePlanId,
        user_id: ownerId,
        title: 'Owner active Plan',
        start_at: at(3 * HOUR_MS),
        end_at: at(4 * HOUR_MS),
      },
      {
        id: foreignPlanId,
        user_id: foreignUserId,
        title: 'Foreign deleted Plan',
        start_at: at(HOUR_MS),
        end_at: at(2 * HOUR_MS),
        deleted_at: deletedAt,
      },
    ]);
    if (planError) throw planError;

    const { error: recordError } = await admin.from('records').insert([
      {
        id: ownerRecordId,
        user_id: ownerId,
        title: 'Owner deleted Record',
        start_at: at(-4 * HOUR_MS),
        end_at: at(-3 * HOUR_MS),
        deleted_at: deletedAt,
      },
      {
        id: activeRecordId,
        user_id: ownerId,
        title: 'Owner active Record',
        start_at: at(-2 * HOUR_MS),
        end_at: at(-HOUR_MS),
      },
      {
        id: foreignRecordId,
        user_id: foreignUserId,
        title: 'Foreign deleted Record',
        start_at: at(-4 * HOUR_MS),
        end_at: at(-3 * HOUR_MS),
        deleted_at: deletedAt,
      },
    ]);
    if (recordError) throw recordError;
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(ownerId);
    await admin.auth.admin.deleteUser(foreignUserId);
  });

  it('returns only soft-deleted Plans and Records owned by the bound user', async () => {
    const reader = createTimeblockTrashReadClient();
    const [plans, records] = await Promise.all([
      reader.listDeletedPlans(ownerId, 50),
      reader.listDeletedRecords(ownerId, 50),
    ]);

    expect(plans.map(({ id }) => id)).toEqual([ownerPlanId]);
    expect(records.map(({ id }) => id)).toEqual([ownerRecordId]);
    expect(JSON.stringify({ plans, records })).not.toContain(foreignUserId);
    expect(JSON.stringify({ plans, records })).not.toContain('user_id');
  });
});

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}
