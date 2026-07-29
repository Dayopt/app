import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpMutationError } from '@/lib/mcp/mutation-contract';

const createPlan = vi.hoisted(() => vi.fn());
const updatePlan = vi.hoisted(() => vi.fn());
const deletePlan = vi.hoisted(() => vi.fn());
const restorePlan = vi.hoisted(() => vi.fn());
const createRecord = vi.hoisted(() => vi.fn());
const updateRecord = vi.hoisted(() => vi.fn());
const deleteRecord = vi.hoisted(() => vi.fn());
const restoreRecord = vi.hoisted(() => vi.fn());
const captureUnexpectedMcpToolError = vi.hoisted(() => vi.fn());
const plansList = vi.hoisted(() => vi.fn());
const plansGetById = vi.hoisted(() => vi.fn());
const recordsList = vi.hoisted(() => vi.fn());
const recordsGetById = vi.hoisted(() => vi.fn());
const tagsList = vi.hoisted(() => vi.fn());
const constraintsGet = vi.hoisted(() => vi.fn());
const reviewGet = vi.hoisted(() => vi.fn());
const createMcpTrpcCaller = vi.hoisted(() => vi.fn());
const listDeletedPlans = vi.hoisted(() => vi.fn());
const listDeletedRecords = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mcp/mutation-client', () => ({
  McpMutationClient: class McpMutationClient {
    createPlan = createPlan;
    updatePlan = updatePlan;
    deletePlan = deletePlan;
    restorePlan = restorePlan;
    createRecord = createRecord;
    updateRecord = updateRecord;
    deleteRecord = deleteRecord;
    restoreRecord = restoreRecord;
  },
}));

vi.mock('@/lib/mcp/tool-error', () => ({ captureUnexpectedMcpToolError }));

const planId = '00000000-0000-4000-8000-000000000001';
const recordId = '00000000-0000-4000-8000-000000000002';
const operationIds = Array.from(
  { length: 8 },
  (_, index) => `00000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
);
const version = '2026-07-23T12:34:56.654321Z';

const plan = {
  id: planId,
  title: 'Plan',
  note: null,
  tag_id: null,
  start_at: '2026-07-23T10:00:00.000Z',
  end_at: '2026-07-23T11:00:00.000Z',
  source: 'api',
  skipped_at: null,
  deleted_at: null,
  created_at: '2026-07-23T09:00:00.000Z',
  updated_at: version,
};
const record = {
  id: recordId,
  title: 'Record',
  note: null,
  tag_id: null,
  plan_id: null,
  start_at: '2026-07-23T08:00:00.000Z',
  end_at: '2026-07-23T09:00:00.000Z',
  source: 'api',
  deleted_at: null,
  created_at: '2026-07-23T07:00:00.000Z',
  updated_at: version,
};

vi.mock('@/lib/mcp/trpc-bridge', () => ({ createMcpTrpcCaller }));

vi.mock('@/features/timeblock/server/service-index', async () => {
  const { z } = await import('zod');
  return {
    createTimeblockTrashReadClient: () => ({ listDeletedPlans, listDeletedRecords }),
    TimeblockTrashReadError: class TimeblockTrashReadError extends Error {},
    TIMEBLOCK_CONTEXT_MAX_RANGE_MS: 31 * 24 * 60 * 60 * 1_000,
    TIMEBLOCK_REVIEW_MAX_TAGS: 1_000,
    isTimeblockDateTime: (value: string) =>
      z.string().datetime({ offset: true }).safeParse(value).success,
    timeblockContextRangeSchema: z
      .object({
        startDate: z.string().datetime({ offset: true }),
        endDate: z.string().datetime({ offset: true }),
      })
      .strict()
      .superRefine((range, context) => {
        const start = Date.parse(range.startDate);
        const end = Date.parse(range.endDate);
        if (start >= end || end - start > 31 * 24 * 60 * 60 * 1_000) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date range' });
        }
      }),
    transformPlanReadModel: (row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      note: row.note,
      tagId: row.tag_id,
      startAt: row.start_at,
      endAt: row.end_at,
      source: row.source,
      skippedAt: row.skipped_at,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
    transformRecordReadModel: (row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      note: row.note,
      tagId: row.tag_id,
      planId: row.plan_id,
      startAt: row.start_at,
      endAt: row.end_at,
      source: row.source,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  };
});

import type { McpRequestContext } from '../../_context';
import { createMcpServer } from '../../_server';

const allScopes: McpRequestContext['scopes'] = [
  'read:entries',
  'read:tags',
  'read:constraints',
  'read:stats',
  'write:plans',
  'delete:plans',
  'write:records',
  'delete:records',
];

const context: McpRequestContext = {
  tokenId: 'token-1',
  connectionId: 'connection-1',
  userId: 'user-1',
  clientId: 'chatgpt',
  scopes: allScopes,
  resourceUri: 'https://mcp.dayopt.app' as McpRequestContext['resourceUri'],
};

const expectedToolNames = [
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

describe('MCP SDK public tool contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plansList.mockResolvedValue([plan]);
    plansGetById.mockResolvedValue(plan);
    recordsList.mockResolvedValue([record]);
    recordsGetById.mockResolvedValue(record);
    tagsList.mockResolvedValue({
      data: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          name: 'Work',
          user_id: context.userId,
          color: 'blue',
          icon: 'briefcase',
          is_active: true,
          parent_id: null,
          sort_order: 0,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
        },
      ],
      count: 1,
    });
    constraintsGet.mockResolvedValue({
      asOf: '2026-07-24T10:00:00.000Z',
      timezone: 'Asia/Tokyo',
      range: {
        startDate: '2026-07-20T00:00:00+09:00',
        endDate: '2026-07-27T00:00:00+09:00',
        endExclusive: true,
      },
      completeness: { complete: true, maxItemsPerLane: 5_000 },
      occupancy: {
        plans: [
          {
            startAt: '2026-07-20T01:00:00.000Z',
            endAt: '2026-07-20T02:00:00.000Z',
          },
        ],
        records: [],
      },
      rules: {
        intervalBoundary: '[)',
        overlap: {
          planVsPlan: 'forbidden',
          recordVsRecord: 'forbidden',
          planVsRecord: 'allowed',
        },
        plans: {
          createEnd: 'after_as_of',
          pastPlanTimeUpdate: 'forbidden',
          pastPlanContentUpdate: 'allowed',
          timeUpdateEnd: 'after_as_of',
          skippedOccupiesLane: true,
        },
        records: {
          createEnd: 'at_or_before_as_of',
          timeUpdateEnd: 'at_or_before_as_of',
          linkedPlan: 'non_deleted_unskipped_completed',
        },
      },
    });
    reviewGet.mockResolvedValue({
      asOf: '2026-07-24T10:00:00.000Z',
      period: {
        startDate: '2026-07-20T00:00:00+09:00',
        endDate: '2026-07-27T00:00:00+09:00',
        endExclusive: true,
        timezone: 'Asia/Tokyo',
      },
      basis: {
        planMeaning: 'budget',
        recordMeaning: 'actual',
        rowFilter: 'active_tagged_start_in_period',
        durationBoundary: 'full_row_not_clipped',
        periodBoundary: '[)',
        varianceConvention: 'planned_minus_recorded',
      },
      hasData: true,
      summary: {
        plannedMinutes: 120,
        recordedMinutes: 90,
        varianceMinutes: 30,
      },
      accuracy: { rate: 0.75, status: 'fair' },
      tags: [
        {
          tagId: '00000000-0000-4000-8000-000000000003',
          plannedMinutes: 120,
          recordedMinutes: 90,
          varianceMinutes: 30,
          variancePercent: 25,
        },
      ],
      signals: [
        { code: 'plan_accuracy', rate: 0.75, status: 'fair' },
        {
          code: 'largest_tag_variance',
          tagId: '00000000-0000-4000-8000-000000000003',
          direction: 'recorded_less_than_planned',
          absoluteMinutes: 30,
        },
      ],
    });
    createMcpTrpcCaller.mockReturnValue({
      plans: {
        getById: plansGetById,
        list: plansList,
      },
      records: {
        getById: recordsGetById,
        list: recordsList,
      },
      tags: { list: tagsList },
      timeblockContext: { getConstraints: constraintsGet },
      statistics: { getMcpReview: reviewGet },
    });
    listDeletedPlans.mockResolvedValue([{ ...plan, deleted_at: version }]);
    listDeletedRecords.mockResolvedValue([{ ...record, deleted_at: version }]);
    createPlan.mockImplementation((input) =>
      Promise.resolve(receipt('plan', input.operationId, planId)),
    );
    updatePlan.mockImplementation((input) =>
      Promise.resolve(receipt('plan', input.operationId, input.planId)),
    );
    deletePlan.mockImplementation((input) =>
      Promise.resolve(receipt('plan', input.operationId, input.planId, version)),
    );
    restorePlan.mockImplementation((input) =>
      Promise.resolve(receipt('plan', input.operationId, input.planId)),
    );
    createRecord.mockImplementation((input) =>
      Promise.resolve(receipt('record', input.operationId, recordId)),
    );
    updateRecord.mockImplementation((input) =>
      Promise.resolve(receipt('record', input.operationId, input.recordId)),
    );
    deleteRecord.mockImplementation((input) =>
      Promise.resolve(receipt('record', input.operationId, input.recordId, version)),
    );
    restoreRecord.mockImplementation((input) =>
      Promise.resolve(receipt('record', input.operationId, input.recordId)),
    );
  });

  it('validates structured read/get/trash results and rejects caller-supplied ownership fields', async () => {
    const { client, server } = await connectSdk(context);
    try {
      await client.listTools();
      const calls = [
        { name: 'entries.list', arguments: {} },
        { name: 'tags.list', arguments: {} },
        {
          name: 'constraints.get',
          arguments: {
            startDate: '2026-07-20T00:00:00+09:00',
            endDate: '2026-07-27T00:00:00+09:00',
          },
        },
        {
          name: 'review.get',
          arguments: {
            startDate: '2026-07-20T00:00:00+09:00',
            endDate: '2026-07-27T00:00:00+09:00',
          },
        },
        { name: 'plans.list', arguments: {} },
        { name: 'plans.get', arguments: { planId } },
        { name: 'plans.trash.list', arguments: {} },
        { name: 'records.list', arguments: {} },
        { name: 'records.get', arguments: { recordId } },
        { name: 'records.trash.list', arguments: {} },
      ];

      for (const call of calls) {
        const result = await client.callTool(call);
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ schemaVersion: 1 });
        expect(JSON.stringify(result.structuredContent)).not.toContain('user_id');
        expect(JSON.stringify(result.structuredContent)).not.toContain(
          'external_calendar_event_id',
        );
      }

      const tagResult = await client.callTool({ name: 'tags.list', arguments: {} });
      const publicTag = (tagResult.structuredContent as { tags: Array<Record<string, unknown>> })
        .tags[0];
      expect(Object.keys(publicTag ?? {}).sort()).toEqual(
        ['color', 'icon', 'id', 'name', 'parentId', 'sortOrder'].sort(),
      );
      expect(JSON.stringify(tagResult)).not.toContain(context.userId);

      const constraintsResult = await client.callTool({
        name: 'constraints.get',
        arguments: {
          startDate: '2026-07-20T00:00:00+09:00',
          endDate: '2026-07-27T00:00:00+09:00',
        },
      });
      expect(JSON.stringify(constraintsResult)).not.toMatch(/title|note|tagId|"id"/);
      const reviewResult = await client.callTool({
        name: 'review.get',
        arguments: {
          startDate: '2026-07-20T00:00:00+09:00',
          endDate: '2026-07-27T00:00:00+09:00',
        },
      });
      expect(reviewResult.structuredContent).toMatchObject({
        schemaVersion: 1,
        summary: {
          plannedMinutes: 120,
          recordedMinutes: 90,
          varianceMinutes: 30,
        },
      });
      expect(JSON.stringify(reviewResult)).not.toMatch(
        /title|note|userId|user_id|source|timeblockId/,
      );
      expect(createMcpTrpcCaller).toHaveBeenCalledWith(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      const rejected = await client.callTool({
        name: 'plans.get',
        arguments: { planId, userId: 'foreign-user' },
      });
      expect(rejected.isError).toBe(true);
      expect(plansGetById).toHaveBeenCalledOnce();

      plansGetById.mockRejectedValueOnce(new TRPCError({ code: 'NOT_FOUND' }));
      const missing = await client.callTool({ name: 'plans.get', arguments: { planId } });
      expect(missing.isError).toBe(true);
      expect(missing.structuredContent).toBeUndefined();
      expect(parseText(missing)).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(captureUnexpectedMcpToolError).not.toHaveBeenCalled();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it('context toolのunknown fieldと不正rangeをSDKがhandler前に拒否する', async () => {
    const { client, server } = await connectSdk(context);
    try {
      const rejectedTags = await client.callTool({
        name: 'tags.list',
        arguments: { userId: 'foreign-user' },
      });
      expect(rejectedTags.isError).toBe(true);
      expect(tagsList).not.toHaveBeenCalled();

      const invalidRanges = [
        {
          startDate: '2026-07-20T00:00:00',
          endDate: '2026-07-27T00:00:00+09:00',
        },
        {
          startDate: '2026-07-27T00:00:00+09:00',
          endDate: '2026-07-20T00:00:00+09:00',
        },
        {
          startDate: '2026-01-01T00:00:00+09:00',
          endDate: '2026-02-01T00:00:00.001+09:00',
        },
        {
          startDate: '2026-07-20T00:00:00+09:00',
          endDate: '2026-07-27T00:00:00+09:00',
          userId: 'foreign-user',
        },
      ];

      for (const arguments_ of invalidRanges) {
        for (const name of ['constraints.get', 'review.get']) {
          const result = await client.callTool({
            name,
            arguments: arguments_,
          });
          expect(result.isError).toBe(true);
        }
      }
      expect(constraintsGet).not.toHaveBeenCalled();
      expect(reviewGet).not.toHaveBeenCalled();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it('constraints handlerはdomain codeをstable errorへ戻しraw detailを隠す', async () => {
    const { client, server } = await connectSdk(context);
    const arguments_ = {
      startDate: '2026-07-20T00:00:00+09:00',
      endDate: '2026-07-27T00:00:00+09:00',
    };

    try {
      constraintsGet.mockRejectedValueOnce(
        new TRPCError({
          code: 'BAD_REQUEST',
          cause: Object.assign(new Error('private dense detail'), { code: 'RANGE_TOO_DENSE' }),
        }),
      );
      const dense = await client.callTool({ name: 'constraints.get', arguments: arguments_ });
      expect(dense.structuredContent).toBeUndefined();
      expect(parseText(dense)).toMatchObject({
        error: { code: 'RANGE_TOO_DENSE', retryable: false },
      });
      expect(JSON.stringify(dense)).not.toContain('private dense detail');

      constraintsGet.mockRejectedValueOnce(
        new TRPCError({
          code: 'CONFLICT',
          cause: Object.assign(new Error('private revision detail'), {
            code: 'CONTEXT_CHANGED',
          }),
        }),
      );
      const changed = await client.callTool({ name: 'constraints.get', arguments: arguments_ });
      expect(parseText(changed)).toMatchObject({
        error: { code: 'CONTEXT_CHANGED', retryable: true },
      });

      constraintsGet.mockRejectedValueOnce(new Error('private database detail'));
      const failed = await client.callTool({ name: 'constraints.get', arguments: arguments_ });
      expect(parseText(failed)).toMatchObject({
        error: { code: 'READ_FAILED', retryable: true },
      });
      expect(JSON.stringify(failed)).not.toContain('private database detail');
      expect(captureUnexpectedMcpToolError).toHaveBeenCalledOnce();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it('review handlerはdomain codeをstable errorへ戻しraw detailとcancel noiseを隠す', async () => {
    const { client, server } = await connectSdk(context);
    const arguments_ = {
      startDate: '2026-07-20T00:00:00+09:00',
      endDate: '2026-07-27T00:00:00+09:00',
    };

    try {
      reviewGet.mockRejectedValueOnce(
        new TRPCError({
          code: 'BAD_REQUEST',
          cause: Object.assign(new Error('private tag cardinality detail'), {
            code: 'RANGE_TOO_DENSE',
          }),
        }),
      );
      const dense = await client.callTool({ name: 'review.get', arguments: arguments_ });
      expect(dense.structuredContent).toBeUndefined();
      expect(parseText(dense)).toMatchObject({
        error: { code: 'RANGE_TOO_DENSE', retryable: false },
      });
      expect(JSON.stringify(dense)).not.toContain('private tag cardinality detail');

      reviewGet.mockRejectedValueOnce(
        new TRPCError({
          code: 'CONFLICT',
          cause: Object.assign(new Error('private revision detail'), {
            code: 'CONTEXT_CHANGED',
          }),
        }),
      );
      const changed = await client.callTool({ name: 'review.get', arguments: arguments_ });
      expect(parseText(changed)).toMatchObject({
        error: { code: 'CONTEXT_CHANGED', retryable: true },
      });

      reviewGet.mockRejectedValueOnce(new Error('private database review detail'));
      const failed = await client.callTool({ name: 'review.get', arguments: arguments_ });
      expect(parseText(failed)).toMatchObject({
        error: { code: 'READ_FAILED', retryable: true },
      });
      expect(JSON.stringify(failed)).not.toContain('private database review detail');
      expect(captureUnexpectedMcpToolError).toHaveBeenCalledOnce();

      reviewGet.mockRejectedValueOnce(
        new TRPCError({
          code: 'CLIENT_CLOSED_REQUEST',
          cause: Object.assign(new Error('private cancellation detail'), {
            code: 'REQUEST_CANCELLED',
          }),
        }),
      );
      const cancelled = await client.callTool({ name: 'review.get', arguments: arguments_ });
      expect(parseText(cancelled)).toMatchObject({
        error: { code: 'READ_FAILED', retryable: true },
      });
      expect(JSON.stringify(cancelled)).not.toContain('private cancellation detail');
      expect(captureUnexpectedMcpToolError).toHaveBeenCalledOnce();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it('lists the exact scope-filtered set with strict public schemas', async () => {
    const { client, server } = await connectSdk(context);
    try {
      const { tools } = await client.listTools();
      expect(tools.map(({ name }) => name)).toEqual(expectedToolNames);
      expect(tools.find(({ name }) => name === 'review.get')?.outputSchema).toMatchObject({
        properties: {
          tags: { maxItems: 1_000 },
        },
      });

      const mutationTools = tools.filter(({ name }) =>
        /\.(create|update|delete|restore)$/.test(name),
      );
      expect(mutationTools).toHaveLength(8);
      for (const tool of mutationTools) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.inputSchema.properties).not.toHaveProperty('connectionId');
        expect(tool.inputSchema.properties).not.toHaveProperty('accessTokenId');
        expect(tool.inputSchema.properties).not.toHaveProperty('confirmed');
        expect(tool.inputSchema.properties).not.toHaveProperty('idempotencyKey');
        expect(tool.outputSchema).toMatchObject({ additionalProperties: false });
      }
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it('executes all eight mutations with server-injected binding and validated receipts', async () => {
    const { client, server } = await connectSdk(context);
    const calls = [
      {
        name: 'plans.create',
        arguments: {
          operationId: operationIds[0],
          title: 'New plan',
          note: null,
          tagId: null,
          startAt: '2026-07-24T10:00:00.000Z',
          endAt: '2026-07-24T11:00:00.000Z',
        },
      },
      {
        name: 'plans.update',
        arguments: {
          operationId: operationIds[1],
          planId,
          expectedUpdatedAt: version,
          title: 'Updated plan',
        },
      },
      {
        name: 'plans.delete',
        arguments: { operationId: operationIds[2], planId, expectedUpdatedAt: version },
      },
      {
        name: 'plans.restore',
        arguments: { operationId: operationIds[3], planId, expectedUpdatedAt: version },
      },
      {
        name: 'records.create',
        arguments: {
          operationId: operationIds[4],
          title: 'New record',
          note: null,
          tagId: null,
          planId: null,
          startAt: '2026-07-23T05:00:00.000Z',
          endAt: '2026-07-23T06:00:00.000Z',
        },
      },
      {
        name: 'records.update',
        arguments: {
          operationId: operationIds[5],
          recordId,
          expectedUpdatedAt: version,
          note: 'Updated record',
        },
      },
      {
        name: 'records.delete',
        arguments: { operationId: operationIds[6], recordId, expectedUpdatedAt: version },
      },
      {
        name: 'records.restore',
        arguments: { operationId: operationIds[7], recordId, expectedUpdatedAt: version },
      },
    ] as const;

    try {
      await client.listTools();
      for (const call of calls) {
        const result = await client.callTool(call);
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          schemaVersion: 1,
          operationId: call.arguments.operationId,
          version,
        });
      }

      for (const method of [
        createPlan,
        updatePlan,
        deletePlan,
        restorePlan,
        createRecord,
        updateRecord,
        deleteRecord,
        restoreRecord,
      ]) {
        expect(method).toHaveBeenCalledOnce();
        expect(method.mock.calls[0]?.[0]).toMatchObject({
          connectionId: context.connectionId,
          accessTokenId: context.tokenId,
        });
        expect(method.mock.calls[0]?.[0]).not.toHaveProperty('userId');
        expect(method.mock.calls[0]?.[0]).not.toHaveProperty('confirmed');
      }
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it('rejects unknown approval fields and returns sanitized domain errors', async () => {
    const { client, server } = await connectSdk(context);
    const validArguments = {
      operationId: operationIds[0],
      title: 'New plan',
      note: null,
      tagId: null,
      startAt: '2026-07-24T10:00:00.000Z',
      endAt: '2026-07-24T11:00:00.000Z',
    };

    try {
      await client.listTools();
      const rejected = await client.callTool({
        name: 'plans.create',
        arguments: { ...validArguments, confirmed: true },
      });
      expect(rejected.isError).toBe(true);
      expect(createPlan).not.toHaveBeenCalled();

      createPlan.mockRejectedValueOnce(
        new McpMutationError('TIME_OVERLAP', 'This time range overlaps with an existing item.'),
      );
      const domainError = await client.callTool({
        name: 'plans.create',
        arguments: validArguments,
      });
      expect(domainError.isError).toBe(true);
      expect(domainError.structuredContent).toBeUndefined();
      expect(parseText(domainError)).toEqual({
        schemaVersion: 1,
        error: {
          code: 'TIME_OVERLAP',
          message: 'This time range overlaps with an existing item.',
          retryable: false,
        },
      });
      expect(captureUnexpectedMcpToolError).not.toHaveBeenCalled();

      createPlan.mockRejectedValueOnce(new Error('private token and database details'));
      const unexpectedError = await client.callTool({
        name: 'plans.create',
        arguments: validArguments,
      });
      expect(JSON.stringify(unexpectedError)).not.toContain('private token');
      expect(parseText(unexpectedError)).toMatchObject({
        error: { code: 'MUTATION_FAILED' },
      });
      expect(captureUnexpectedMcpToolError).toHaveBeenCalledOnce();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});

function receipt(
  resourceType: 'plan' | 'record',
  operationId: string,
  resourceId: string,
  deletedAt: string | null = null,
) {
  return {
    schemaVersion: 1 as const,
    operationId,
    resourceType,
    resourceId,
    version,
    deletedAt,
    replayed: false,
  };
}

async function connectSdk(requestContext: McpRequestContext) {
  const server = createMcpServer(requestContext);
  const client = new Client({ name: 'dayopt-contract-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

function parseText(result: unknown) {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new Error('Missing MCP content');
  }
  const content = result.content[0];
  if (!isRecord(content) || content.type !== 'text' || typeof content.text !== 'string') {
    throw new Error('Missing MCP text content');
  }
  return JSON.parse(content.text) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
