import { describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import { McpMutationClient } from '../mcp-mutation-client';
import type { createMcpMutationDb } from '../mcp-mutation-db';
import type { ServiceSupabaseClient } from '../types';

/**
 * #1576 の archived tag ガードが MCP mutation 経路 (McpMutationClient) にも
 * 配線されていることを固定する。main マージで合流したこの経路は
 * PlanService / RecordService / TimeblockCommandService を経由せず、
 * assertTagAssignable を素通りしていた。
 */

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_TAG_ID = '00000000-0000-4000-8000-0000000000d2';
const ARCHIVED_TAG_ID = '00000000-0000-4000-8000-0000000000d1';
const CONNECTION_ID = '00000000-0000-4000-8000-0000000000c1';
const ACCESS_TOKEN_ID = '00000000-0000-4000-8000-0000000000c2';

type FakeMutationDb = ReturnType<typeof createMcpMutationDb>;

/** 戻り値は緩い型のまま (loose) にし、mockResolvedValue で任意の receipt 形を返せるようにする。 */
function createFakeDb() {
  return {
    applyPlanCreate: vi.fn(),
    applyPlanUpdate: vi.fn(),
    applyPlanDelete: vi.fn(),
    applyPlanRestore: vi.fn(),
    applyRecordCreate: vi.fn(),
    applyRecordUpdate: vi.fn(),
    applyRecordDelete: vi.fn(),
    applyRecordRestore: vi.fn(),
  };
}

function buildClient(
  db: ReturnType<typeof createFakeDb>,
  supabase: ReturnType<typeof createMockSupabase>,
): McpMutationClient {
  return new McpMutationClient(
    db as unknown as FakeMutationDb,
    supabase as unknown as ServiceSupabaseClient,
  );
}

function planReceiptRow(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    operation_id: 'op-1',
    resource_type: 'plan',
    resource_id: 'plan-1',
    version: '2026-08-01T00:00:00.000000Z',
    deleted_at: null,
    replayed: false,
    ...overrides,
  };
}

function recordReceiptRow(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    operation_id: 'op-1',
    resource_type: 'record',
    resource_id: 'record-1',
    version: '2026-08-01T00:00:00.000000Z',
    deleted_at: null,
    replayed: false,
    ...overrides,
  };
}

describe('McpMutationClient archived tag guard', () => {
  it('plans.createはarchivedタグを指定するとTAG_ARCHIVEDで拒否し、apply RPCを呼ばずuser_idで絞ってtagを引く', async () => {
    const tagQuery = createChainableMock({ archived_at: '2026-07-20T00:00:00.000000Z' });
    const fromSpy = vi.fn(() => tagQuery);
    const supabase = createMockSupabase({ from: fromSpy });
    const db = createFakeDb();
    const client = buildClient(db, supabase);

    await expect(
      client.createPlan({
        operationId: 'op-1',
        userId: USER_ID,
        title: 'Plan',
        note: null,
        tagId: ARCHIVED_TAG_ID,
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-08-01T01:00:00.000Z',
        connectionId: CONNECTION_ID,
        accessTokenId: ACCESS_TOKEN_ID,
      }),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

    expect(db.applyPlanCreate).not.toHaveBeenCalled();
    expect(fromSpy).toHaveBeenCalledWith('tags');
    expect(tagQuery.eq).toHaveBeenCalledWith('id', ARCHIVED_TAG_ID);
    expect(tagQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('plans.createはtagId未指定ならtag lookupをskipしてapply RPCへ進む', async () => {
    const fromSpy = vi.fn();
    const supabase = createMockSupabase({ from: fromSpy });
    const db = createFakeDb();
    db.applyPlanCreate.mockResolvedValue({
      data: [planReceiptRow({ operation_id: 'op-2' })],
      error: null,
    });
    const client = buildClient(db, supabase);

    const receipt = await client.createPlan({
      operationId: 'op-2',
      userId: USER_ID,
      title: 'Plan',
      note: null,
      tagId: null,
      startAt: '2026-08-01T00:00:00.000Z',
      endAt: '2026-08-01T01:00:00.000Z',
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(fromSpy).not.toHaveBeenCalled();
    expect(db.applyPlanCreate).toHaveBeenCalledOnce();
    expect(receipt).toEqual({
      schemaVersion: 1,
      operationId: 'op-2',
      resourceType: 'plan',
      resourceId: 'plan-1',
      version: '2026-08-01T00:00:00.000000Z',
      deletedAt: null,
      replayed: false,
    });
  });

  it('plans.updateはtagIdを省略した編集ならguardをskipし、既にarchived済みのタグ保持も通す', async () => {
    const fromSpy = vi.fn();
    const supabase = createMockSupabase({ from: fromSpy });
    const db = createFakeDb();
    db.applyPlanUpdate.mockResolvedValue({
      data: [planReceiptRow({ operation_id: 'op-3' })],
      error: null,
    });
    const client = buildClient(db, supabase);

    await client.updatePlan({
      operationId: 'op-3',
      planId: 'plan-1',
      userId: USER_ID,
      expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
      title: 'Title only change',
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(fromSpy).not.toHaveBeenCalled();
    expect(db.applyPlanUpdate).toHaveBeenCalledOnce();
  });

  it('plans.updateはtagIdを明示指定するとarchived tagを拒否し、apply RPCを呼ばない', async () => {
    const tagQuery = createChainableMock({ archived_at: '2026-07-20T00:00:00.000000Z' });
    const supabase = createMockSupabase({ from: vi.fn(() => tagQuery) });
    const db = createFakeDb();
    const client = buildClient(db, supabase);

    await expect(
      client.updatePlan({
        operationId: 'op-4',
        planId: 'plan-1',
        userId: USER_ID,
        expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
        tagId: ARCHIVED_TAG_ID,
        connectionId: CONNECTION_ID,
        accessTokenId: ACCESS_TOKEN_ID,
      }),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

    expect(db.applyPlanUpdate).not.toHaveBeenCalled();
  });

  it('plans.updateはtagIdを明示指定してもactiveなタグなら許可しapply RPCを呼ぶ', async () => {
    const tagQuery = createChainableMock({ archived_at: null });
    const supabase = createMockSupabase({ from: vi.fn(() => tagQuery) });
    const db = createFakeDb();
    db.applyPlanUpdate.mockResolvedValue({
      data: [planReceiptRow({ operation_id: 'op-5' })],
      error: null,
    });
    const client = buildClient(db, supabase);

    await client.updatePlan({
      operationId: 'op-5',
      planId: 'plan-1',
      userId: USER_ID,
      expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
      tagId: OTHER_TAG_ID,
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(db.applyPlanUpdate).toHaveBeenCalledOnce();
  });

  it('records.createはarchivedタグを指定するとTAG_ARCHIVEDで拒否し、apply RPCを呼ばない', async () => {
    const tagQuery = createChainableMock({ archived_at: '2026-07-20T00:00:00.000000Z' });
    const supabase = createMockSupabase({ from: vi.fn(() => tagQuery) });
    const db = createFakeDb();
    const client = buildClient(db, supabase);

    await expect(
      client.createRecord({
        operationId: 'op-6',
        userId: USER_ID,
        title: 'Record',
        note: null,
        tagId: ARCHIVED_TAG_ID,
        planId: null,
        startAt: '2026-07-31T00:00:00.000Z',
        endAt: '2026-07-31T01:00:00.000Z',
        connectionId: CONNECTION_ID,
        accessTokenId: ACCESS_TOKEN_ID,
      }),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

    expect(db.applyRecordCreate).not.toHaveBeenCalled();
  });

  it('records.updateはtagIdを省略した編集ならguardをskipする', async () => {
    const fromSpy = vi.fn();
    const supabase = createMockSupabase({ from: fromSpy });
    const db = createFakeDb();
    db.applyRecordUpdate.mockResolvedValue({
      data: [recordReceiptRow({ operation_id: 'op-7' })],
      error: null,
    });
    const client = buildClient(db, supabase);

    await client.updateRecord({
      operationId: 'op-7',
      recordId: 'record-1',
      userId: USER_ID,
      expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
      note: 'changed note only',
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(fromSpy).not.toHaveBeenCalled();
    expect(db.applyRecordUpdate).toHaveBeenCalledOnce();
  });

  it('records.updateはtagIdを明示指定するとarchived tagを拒否し、apply RPCを呼ばない', async () => {
    const tagQuery = createChainableMock({ archived_at: '2026-07-20T00:00:00.000000Z' });
    const supabase = createMockSupabase({ from: vi.fn(() => tagQuery) });
    const db = createFakeDb();
    const client = buildClient(db, supabase);

    await expect(
      client.updateRecord({
        operationId: 'op-8',
        recordId: 'record-1',
        userId: USER_ID,
        expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
        tagId: ARCHIVED_TAG_ID,
        connectionId: CONNECTION_ID,
        accessTokenId: ACCESS_TOKEN_ID,
      }),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

    expect(db.applyRecordUpdate).not.toHaveBeenCalled();
  });
});
