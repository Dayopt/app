import { NextRequest } from 'next/server';

import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA,
  MCP_TAG_LIST_OUTPUT_SCHEMA,
} from '@/app/api/mcp/_tools/context-contract';
import { MCP_REVIEW_GET_OUTPUT_SCHEMA } from '@/app/api/mcp/_tools/review-contract';
import { POST as postMcp } from '@/app/api/mcp/route';
import type { Database } from '@/lib/database';
import { hashToken } from '@/lib/oauth-server';
import { derivePkceS256Challenge } from '@/lib/oauth-server/tokens';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RUN_LOCAL = process.env.USE_LOCAL_DB === 'true';
const HOUR_MS = 60 * 60_000;

const admin = createClient<Database>(LOCAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ownerId = crypto.randomUUID();
const foreignUserId = crypto.randomUUID();
const password = 'test-password-123';
const resource = 'https://mcp.dayopt.app';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const challenge = derivePkceS256Challenge('v'.repeat(43));

const mutationReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationId: z.string().uuid(),
    resourceType: z.enum(['plan', 'record']),
    resourceId: z.string().uuid(),
    version: z.string().datetime({ offset: true }),
    deletedAt: z.null(),
    replayed: z.boolean(),
  })
  .strict();

let accessToken = '';
let originalMutationControl:
  | {
      writes_enabled: boolean;
      enabled_client_ids: string[];
    }
  | undefined;

describe.skipIf(!RUN_LOCAL)('MCP Plan → Track → Learn integration', () => {
  beforeAll(async () => {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_DB_URL) {
      throw new Error('MCP Plan → Track → Learn integration requires the local Supabase URL');
    }
    vi.stubEnv('MCP_WRITE_ENABLED_CLIENTS', 'chatgpt');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    for (const [id, label] of [
      [ownerId, 'owner'],
      [foreignUserId, 'foreign'],
    ] as const) {
      const { error } = await admin.auth.admin.createUser({
        id,
        email: `mcp-plan-track-learn-${label}-${id}@example.com`,
        password,
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ subscription_status: 'active' })
      .eq('id', ownerId);
    if (profileError) throw profileError;

    const { error: settingsError } = await admin
      .from('user_settings')
      .upsert({ user_id: ownerId, timezone: 'Asia/Tokyo' }, { onConflict: 'user_id' });
    if (settingsError) throw settingsError;

    originalMutationControl = await readMutationControl();
    if (!originalMutationControl.enabled_client_ids.includes('chatgpt')) {
      await setClientWriteControl(true);
    }
    if (!originalMutationControl.writes_enabled) {
      await setMutationControl(true);
    }
    accessToken = await createAccessToken();
  });

  afterEach(async () => {
    for (const userId of [ownerId, foreignUserId]) {
      const { error: recordError } = await admin.from('records').delete().eq('user_id', userId);
      if (recordError) throw recordError;
      const { error: planError } = await admin.from('plans').delete().eq('user_id', userId);
      if (planError) throw planError;
      const { error: tagError } = await admin.from('tags').delete().eq('user_id', userId);
      if (tagError) throw tagError;
    }
  });

  afterAll(async () => {
    try {
      await admin.auth.admin.deleteUser(ownerId);
      await admin.auth.admin.deleteUser(foreignUserId);
      if (originalMutationControl && !originalMutationControl.writes_enabled) {
        await setMutationControl(false);
      }
      if (
        originalMutationControl &&
        !originalMutationControl.enabled_client_ids.includes('chatgpt')
      ) {
        await setClientWriteControl(false);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('binds tags, constraints, and review to one owner with minimal public fields', async () => {
    const base = Date.now();
    const range = {
      startDate: instant(base - 4 * HOUR_MS),
      endDate: instant(base + 4 * HOUR_MS),
    };
    const rootTagId = crypto.randomUUID();
    const childTagId = crypto.randomUUID();
    const inactiveTagId = crypto.randomUUID();
    const foreignTagId = crypto.randomUUID();

    const { error: tagError } = await admin.from('tags').insert([
      {
        id: rootTagId,
        user_id: ownerId,
        name: 'Deep work',
        color: 'blue',
        icon: 'brain',
        is_active: true,
        sort_order: 0,
      },
      {
        id: childTagId,
        user_id: ownerId,
        name: 'Writing',
        color: 'green',
        icon: null,
        is_active: true,
        parent_id: rootTagId,
        sort_order: 0,
      },
      {
        id: inactiveTagId,
        user_id: ownerId,
        name: 'Inactive private tag',
        color: 'gray',
        is_active: false,
        sort_order: 1,
      },
      {
        id: foreignTagId,
        user_id: foreignUserId,
        name: 'Foreign private tag',
        color: 'red',
        is_active: true,
        sort_order: 0,
      },
    ]);
    if (tagError) throw tagError;

    const ownerUntaggedPlan = {
      startAt: instant(base + 30 * 60_000),
      endAt: instant(base + 60 * 60_000),
    };
    const ownerTaggedPlan = {
      startAt: instant(base + 2 * HOUR_MS),
      endAt: instant(base + 3 * HOUR_MS),
    };
    const { error: planError } = await admin.from('plans').insert([
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner untagged private Plan',
        note: 'owner-plan-private-note',
        start_at: ownerUntaggedPlan.startAt,
        end_at: ownerUntaggedPlan.endAt,
      },
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner tagged private Plan',
        note: 'owner-plan-private-note',
        tag_id: rootTagId,
        start_at: ownerTaggedPlan.startAt,
        end_at: ownerTaggedPlan.endAt,
      },
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner deleted private Plan',
        note: 'owner-plan-private-note',
        tag_id: rootTagId,
        start_at: instant(base + 70 * 60_000),
        end_at: instant(base + 90 * 60_000),
        deleted_at: instant(base),
      },
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner end-boundary private Plan',
        note: 'owner-plan-private-note',
        tag_id: rootTagId,
        start_at: range.endDate,
        end_at: instant(base + 5 * HOUR_MS),
      },
      {
        id: crypto.randomUUID(),
        user_id: foreignUserId,
        title: 'Foreign private Plan',
        note: 'foreign-plan-private-note',
        tag_id: foreignTagId,
        start_at: ownerTaggedPlan.startAt,
        end_at: ownerTaggedPlan.endAt,
      },
    ]);
    if (planError) throw planError;

    const ownerBeforeRangeRecord = {
      startAt: instant(base - 5 * HOUR_MS),
      endAt: instant(base - 210 * 60_000),
    };
    const ownerTaggedRecord = {
      startAt: instant(base - 3 * HOUR_MS),
      endAt: instant(base - 150 * 60_000),
    };
    const ownerUntaggedRecord = {
      startAt: instant(base - HOUR_MS),
      endAt: instant(base - 30 * 60_000),
    };
    const { error: recordError } = await admin.from('records').insert([
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner overlap-boundary private Record',
        note: 'owner-record-private-note',
        tag_id: rootTagId,
        start_at: ownerBeforeRangeRecord.startAt,
        end_at: ownerBeforeRangeRecord.endAt,
      },
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner tagged private Record',
        note: 'owner-record-private-note',
        tag_id: rootTagId,
        start_at: ownerTaggedRecord.startAt,
        end_at: ownerTaggedRecord.endAt,
      },
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner deleted private Record',
        note: 'owner-record-private-note',
        tag_id: rootTagId,
        start_at: instant(base - 2 * HOUR_MS),
        end_at: instant(base - 90 * 60_000),
        deleted_at: instant(base),
      },
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        title: 'Owner untagged private Record',
        note: 'owner-record-private-note',
        start_at: ownerUntaggedRecord.startAt,
        end_at: ownerUntaggedRecord.endAt,
      },
      {
        id: crypto.randomUUID(),
        user_id: foreignUserId,
        title: 'Foreign private Record',
        note: 'foreign-record-private-note',
        tag_id: foreignTagId,
        start_at: ownerTaggedRecord.startAt,
        end_at: ownerTaggedRecord.endAt,
      },
    ]);
    if (recordError) throw recordError;

    const tags = await callMcpTool('tags.list', {}, MCP_TAG_LIST_OUTPUT_SCHEMA);
    expect(tags).toEqual({
      schemaVersion: 1,
      count: 2,
      tags: [
        {
          id: rootTagId,
          name: 'Deep work',
          color: 'blue',
          icon: 'brain',
          parentId: null,
          sortOrder: 0,
        },
        {
          id: childTagId,
          name: 'Writing',
          color: 'green',
          icon: null,
          parentId: rootTagId,
          sortOrder: 0,
        },
      ],
    });

    const constraints = await callMcpTool(
      'constraints.get',
      range,
      MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA,
    );
    expect(constraints).toMatchObject({
      schemaVersion: 1,
      timezone: 'Asia/Tokyo',
      range: { ...range, endExclusive: true },
      completeness: { complete: true, maxItemsPerLane: 5_000 },
    });
    expect(canonicalizeOccupancy(constraints.occupancy)).toEqual({
      plans: [ownerUntaggedPlan, ownerTaggedPlan],
      records: [ownerBeforeRangeRecord, ownerTaggedRecord, ownerUntaggedRecord],
    });
    expect(JSON.stringify(constraints)).not.toMatch(
      /private|title|note|tagId|foreign|user_id|"id"/i,
    );

    const review = await callMcpTool('review.get', range, MCP_REVIEW_GET_OUTPUT_SCHEMA);
    expect(review).toMatchObject({
      schemaVersion: 1,
      period: {
        ...range,
        endExclusive: true,
        timezone: 'Asia/Tokyo',
      },
      hasData: true,
      summary: {
        plannedMinutes: 60,
        recordedMinutes: 30,
        varianceMinutes: 30,
      },
      accuracy: { rate: 0.5, status: 'poor' },
      tags: [
        {
          tagId: rootTagId,
          plannedMinutes: 60,
          recordedMinutes: 30,
          varianceMinutes: 30,
          variancePercent: 50,
        },
      ],
      signals: [
        { code: 'plan_accuracy', rate: 0.5, status: 'poor' },
        {
          code: 'largest_tag_variance',
          tagId: rootTagId,
          direction: 'recorded_less_than_planned',
          absoluteMinutes: 30,
        },
      ],
    });
    expect(JSON.stringify(review)).not.toMatch(
      /private|title|note|foreign|user_id|planId|recordId|source/i,
    );
    expect(JSON.stringify(review)).not.toContain(foreignTagId);
    expect(JSON.stringify(tags)).not.toContain(inactiveTagId);
    expect(JSON.stringify(tags)).not.toContain(foreignTagId);
  });

  it('uses observed Plan versus Record variance to update the next Plan through MCP HTTP', async () => {
    const tagId = crypto.randomUUID();
    const { error: tagError } = await admin.from('tags').insert({
      id: tagId,
      user_id: ownerId,
      name: 'Focused work',
      color: 'blue',
      sort_order: 0,
    });
    if (tagError) throw tagError;

    const base = Date.now();
    const contextRange = {
      startDate: instant(base - 2 * HOUR_MS),
      endDate: instant(base + 6 * HOUR_MS),
    };
    const initialTags = await callMcpTool('tags.list', {}, MCP_TAG_LIST_OUTPUT_SCHEMA);
    const initialConstraints = await callMcpTool(
      'constraints.get',
      contextRange,
      MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA,
    );
    expect(initialTags.tags.map(({ id }) => id)).toEqual([tagId]);
    expect(initialConstraints.occupancy).toEqual({ plans: [], records: [] });

    const executionPlanOperationId = crypto.randomUUID();
    const executionEndMs = base + 3_000;
    const executionStartMs = executionEndMs - HOUR_MS;
    const executionPlan = await callMcpTool(
      'plans.create',
      {
        operationId: executionPlanOperationId,
        title: 'Execute focused work',
        note: 'Created in the Plan phase',
        tagId,
        startAt: instant(executionStartMs),
        endAt: instant(executionEndMs),
      },
      mutationReceiptSchema,
    );

    const nextPlanOperationId = crypto.randomUUID();
    const nextPlanStartMs = base + 2 * HOUR_MS;
    const nextPlan = await callMcpTool(
      'plans.create',
      {
        operationId: nextPlanOperationId,
        title: 'Next focused work',
        note: 'Initial 60 minute budget',
        tagId,
        startAt: instant(nextPlanStartMs),
        endAt: instant(nextPlanStartMs + HOUR_MS),
      },
      mutationReceiptSchema,
    );

    await waitUntil(executionEndMs + 100);

    const recordOperationId = crypto.randomUUID();
    const record = await callMcpTool(
      'records.create',
      {
        operationId: recordOperationId,
        title: 'Tracked focused work',
        note: '45 observed minutes',
        tagId,
        planId: executionPlan.resourceId,
        startAt: instant(executionStartMs),
        endAt: instant(executionStartMs + 45 * 60_000),
      },
      mutationReceiptSchema,
    );
    expect(record.resourceType).toBe('record');

    const reviewRange = {
      startDate: contextRange.startDate,
      endDate: instant(base + HOUR_MS),
    };
    const review = await callMcpTool('review.get', reviewRange, MCP_REVIEW_GET_OUTPUT_SCHEMA);
    expect(review).toMatchObject({
      hasData: true,
      summary: {
        plannedMinutes: 60,
        recordedMinutes: 45,
        varianceMinutes: 15,
      },
      accuracy: { rate: 0.75, status: 'fair' },
      tags: [
        {
          tagId,
          plannedMinutes: 60,
          recordedMinutes: 45,
          varianceMinutes: 15,
          variancePercent: 25,
        },
      ],
    });

    const learnedMinutes = review.tags[0]!.recordedMinutes;
    const updateOperationId = crypto.randomUUID();
    const updatedNextPlan = await callMcpTool(
      'plans.update',
      {
        operationId: updateOperationId,
        planId: nextPlan.resourceId,
        expectedUpdatedAt: nextPlan.version,
        title: 'Next focused work — adjusted',
        endAt: instant(nextPlanStartMs + learnedMinutes * 60_000),
      },
      mutationReceiptSchema,
    );
    expect(updatedNextPlan).toMatchObject({
      operationId: updateOperationId,
      resourceType: 'plan',
      resourceId: nextPlan.resourceId,
      replayed: false,
    });

    const finalConstraints = await callMcpTool(
      'constraints.get',
      contextRange,
      MCP_CONSTRAINTS_GET_OUTPUT_SCHEMA,
    );
    expect(canonicalizeOccupancy(finalConstraints.occupancy)).toEqual({
      plans: [
        { startAt: instant(executionStartMs), endAt: instant(executionEndMs) },
        {
          startAt: instant(nextPlanStartMs),
          endAt: instant(nextPlanStartMs + 45 * 60_000),
        },
      ],
      records: [
        {
          startAt: instant(executionStartMs),
          endAt: instant(executionStartMs + 45 * 60_000),
        },
      ],
    });

    const [{ data: persistedPlan, error: persistedPlanError }, persistedRecord, receipts] =
      await Promise.all([
        admin
          .from('plans')
          .select('id,title,tag_id,start_at,end_at,source')
          .eq('id', nextPlan.resourceId)
          .single(),
        admin
          .from('records')
          .select('id,plan_id,tag_id,start_at,end_at,source')
          .eq('id', record.resourceId)
          .single(),
        admin
          .from('mcp_mutation_receipts')
          .select('operation_id,tool_name')
          .eq('user_id', ownerId)
          .in('operation_id', [
            executionPlanOperationId,
            nextPlanOperationId,
            recordOperationId,
            updateOperationId,
          ]),
      ]);
    if (persistedPlanError) throw persistedPlanError;
    if (persistedRecord.error) throw persistedRecord.error;
    if (receipts.error) throw receipts.error;

    expect(persistedPlan).toMatchObject({
      id: nextPlan.resourceId,
      title: 'Next focused work — adjusted',
      tag_id: tagId,
      source: 'api',
    });
    expect(Date.parse(persistedPlan.start_at)).toBe(nextPlanStartMs);
    expect(Date.parse(persistedPlan.end_at)).toBe(nextPlanStartMs + 45 * 60_000);
    expect(persistedRecord.data).toMatchObject({
      id: record.resourceId,
      plan_id: executionPlan.resourceId,
      tag_id: tagId,
      source: 'api',
    });
    expect(Date.parse(persistedRecord.data.start_at)).toBe(executionStartMs);
    expect(Date.parse(persistedRecord.data.end_at)).toBe(executionStartMs + 45 * 60_000);
    expect(receipts.data?.map(({ tool_name }) => tool_name).sort()).toEqual([
      'plans.create',
      'plans.create',
      'plans.update',
      'records.create',
    ]);
  });
});

async function callMcpTool<T>(
  name: string,
  args: Record<string, unknown>,
  outputSchema: z.ZodType<T>,
): Promise<T> {
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
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);

  const body = (await response.json()) as unknown;
  if (!isObject(body) || !isObject(body.result)) {
    throw new Error('MCP response did not contain a tool result');
  }
  if (body.result.isError === true) {
    const content = Array.isArray(body.result.content) ? body.result.content[0] : null;
    const detail =
      isObject(content) && content.type === 'text' && typeof content.text === 'string'
        ? content.text
        : 'unknown MCP tool error';
    throw new Error(detail);
  }

  return outputSchema.parse(body.result.structuredContent);
}

async function createAccessToken(): Promise<string> {
  const code = `code-${crypto.randomUUID()}`;
  const token = `dop_at_${crypto.randomUUID()}`;
  const { error: grantError } = await admin.rpc('create_oauth_authorization_grant_v2', {
    p_user_id: ownerId,
    p_client_id: 'chatgpt',
    p_resource_uri: resource,
    p_scopes: [
      'read:entries',
      'read:tags',
      'read:constraints',
      'read:stats',
      'write:plans',
      'write:records',
    ],
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

async function readMutationControl() {
  const { data, error } = await admin
    .from('mcp_mutation_control')
    .select('writes_enabled, enabled_client_ids, revision')
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

async function setClientWriteControl(enabled: boolean): Promise<void> {
  const current = await readMutationControl();
  const { error } = await admin.rpc('set_mcp_client_write_control_v1', {
    p_client_id: 'chatgpt',
    p_enabled: enabled,
    p_expected_revision: current.revision,
  });
  if (error) throw error;
}

async function waitUntil(timestamp: number): Promise<void> {
  const remaining = timestamp - Date.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function instant(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function canonicalizeOccupancy(occupancy: {
  plans: Array<{ startAt: string; endAt: string }>;
  records: Array<{ startAt: string; endAt: string }>;
}) {
  return {
    plans: occupancy.plans.map(canonicalizeInterval),
    records: occupancy.records.map(canonicalizeInterval),
  };
}

function canonicalizeInterval(interval: { startAt: string; endAt: string }) {
  return {
    startAt: instant(Date.parse(interval.startAt)),
    endAt: instant(Date.parse(interval.endAt)),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
