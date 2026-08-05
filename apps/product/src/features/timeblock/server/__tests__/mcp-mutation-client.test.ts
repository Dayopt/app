import { describe, expect, it, vi } from 'vitest';

import { McpMutationClient } from '../mcp-mutation-client';
import type { createMcpMutationDb } from '../mcp-mutation-db';

/**
 * #1824: アーカイブ済みタグの拒否は DB の command 境界が担う
 * (`assert_active_timeblock_tag_v1` が DT014 を投げる)。
 *
 * この経路はかつて TS 側の preflight (`assertTagOwned`) で拒否していたが、
 * preflight が apply RPC より前に走るため「create 成功 → レスポンス消失 →
 * タグがアーカイブされる → 同じ operationId で再送」という replay が
 * TAG_ARCHIVED で誤って弾かれていた。RPC 側は replay を domain validation より
 * 先に解決する設計なので (20260729062456_recheck_mcp_plan_create_authority.sql)、
 * preflight を外して DB へ委ねる。
 *
 * ここで固定するのは 3 点:
 *   1. DB の DT014 が TAG_ARCHIVED へマップされる
 *   2. tagId の内容によらず apply RPC へ到達する (preflight が復活したら落ちる)
 *   3. replay は間にアーカイブが挟まっても保存済み receipt を返す
 */

const ARCHIVED_TAG_ID = '00000000-0000-4000-8000-0000000000d1';
const OTHER_TAG_ID = '00000000-0000-4000-8000-0000000000d2';
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

function buildClient(db: ReturnType<typeof createFakeDb>): McpMutationClient {
  return new McpMutationClient(db as unknown as FakeMutationDb);
}

/** command 境界がアーカイブ済みタグを拒否したときに PostgREST が返す形。 */
const ARCHIVED_TAG_DB_ERROR = { data: null, error: { code: 'DT014' } };

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

describe('McpMutationClient archived tag boundary', () => {
  it('plans.createはDBのDT014をTAG_ARCHIVEDへマップし、preflightせずapply RPCまで到達する', async () => {
    const db = createFakeDb();
    db.applyPlanCreate.mockResolvedValue(ARCHIVED_TAG_DB_ERROR);
    const client = buildClient(db);

    await expect(
      client.createPlan({
        operationId: 'op-1',
        title: 'Plan',
        note: null,
        tagId: ARCHIVED_TAG_ID,
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-08-01T01:00:00.000Z',
        connectionId: CONNECTION_ID,
        accessTokenId: ACCESS_TOKEN_ID,
      }),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

    // preflight が復活すると RPC が呼ばれなくなるため、この assertion が回帰センサーになる。
    expect(db.applyPlanCreate).toHaveBeenCalledOnce();
  });

  it('plans.createはtagId未指定でもapply RPCへ進む', async () => {
    const db = createFakeDb();
    db.applyPlanCreate.mockResolvedValue({
      data: [planReceiptRow({ operation_id: 'op-2' })],
      error: null,
    });
    const client = buildClient(db);

    const receipt = await client.createPlan({
      operationId: 'op-2',
      title: 'Plan',
      note: null,
      tagId: null,
      startAt: '2026-08-01T00:00:00.000Z',
      endAt: '2026-08-01T01:00:00.000Z',
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

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

  it('plans.createの再送は、間にタグがアーカイブされても保存済みreceiptを返す', async () => {
    const db = createFakeDb();
    // RPC は replay を domain validation より先に解決するため、初回成功後に
    // タグがアーカイブされても replayed receipt が返る。preflight があると
    // ここへ到達する前に TAG_ARCHIVED で弾かれてしまう (#1824 の症状 2)。
    db.applyPlanCreate.mockResolvedValue({
      data: [planReceiptRow({ operation_id: 'op-3', replayed: true })],
      error: null,
    });
    const client = buildClient(db);

    const receipt = await client.createPlan({
      operationId: 'op-3',
      title: 'Plan',
      note: null,
      tagId: ARCHIVED_TAG_ID,
      startAt: '2026-08-01T00:00:00.000Z',
      endAt: '2026-08-01T01:00:00.000Z',
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(receipt.replayed).toBe(true);
    expect(db.applyPlanCreate).toHaveBeenCalledOnce();
  });

  it('plans.updateはtagIdを省略した編集ならタグ検証なしで通る', async () => {
    const db = createFakeDb();
    db.applyPlanUpdate.mockResolvedValue({
      data: [planReceiptRow({ operation_id: 'op-4' })],
      error: null,
    });
    const client = buildClient(db);

    await client.updatePlan({
      operationId: 'op-4',
      planId: 'plan-1',
      expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
      title: 'Title only change',
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(db.applyPlanUpdate).toHaveBeenCalledOnce();
  });

  it('plans.updateはarchivedタグへの付け替えをDT014経由で拒否する', async () => {
    const db = createFakeDb();
    db.applyPlanUpdate.mockResolvedValue(ARCHIVED_TAG_DB_ERROR);
    const client = buildClient(db);

    await expect(
      client.updatePlan({
        operationId: 'op-5',
        planId: 'plan-1',
        expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
        tagId: ARCHIVED_TAG_ID,
        connectionId: CONNECTION_ID,
        accessTokenId: ACCESS_TOKEN_ID,
      }),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

    expect(db.applyPlanUpdate).toHaveBeenCalledOnce();
  });

  it('plans.updateはactiveなタグへの付け替えを通す', async () => {
    const db = createFakeDb();
    db.applyPlanUpdate.mockResolvedValue({
      data: [planReceiptRow({ operation_id: 'op-6' })],
      error: null,
    });
    const client = buildClient(db);

    await client.updatePlan({
      operationId: 'op-6',
      planId: 'plan-1',
      expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
      tagId: OTHER_TAG_ID,
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(db.applyPlanUpdate).toHaveBeenCalledOnce();
  });

  it('records.createはDBのDT014をTAG_ARCHIVEDへマップする', async () => {
    const db = createFakeDb();
    db.applyRecordCreate.mockResolvedValue(ARCHIVED_TAG_DB_ERROR);
    const client = buildClient(db);

    await expect(
      client.createRecord({
        operationId: 'op-7',
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

    expect(db.applyRecordCreate).toHaveBeenCalledOnce();
  });

  it('records.updateはtagIdを省略した編集ならタグ検証なしで通る', async () => {
    const db = createFakeDb();
    db.applyRecordUpdate.mockResolvedValue({
      data: [recordReceiptRow({ operation_id: 'op-8' })],
      error: null,
    });
    const client = buildClient(db);

    await client.updateRecord({
      operationId: 'op-8',
      recordId: 'record-1',
      expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
      note: 'changed note only',
      connectionId: CONNECTION_ID,
      accessTokenId: ACCESS_TOKEN_ID,
    });

    expect(db.applyRecordUpdate).toHaveBeenCalledOnce();
  });

  it('records.updateはarchivedタグへの付け替えをDT014経由で拒否する', async () => {
    const db = createFakeDb();
    db.applyRecordUpdate.mockResolvedValue(ARCHIVED_TAG_DB_ERROR);
    const client = buildClient(db);

    await expect(
      client.updateRecord({
        operationId: 'op-9',
        recordId: 'record-1',
        expectedUpdatedAt: '2026-07-31T00:00:00.000000Z',
        tagId: ARCHIVED_TAG_ID,
        connectionId: CONNECTION_ID,
        accessTokenId: ACCESS_TOKEN_ID,
      }),
    ).rejects.toMatchObject({ code: 'TAG_ARCHIVED' });

    expect(db.applyRecordUpdate).toHaveBeenCalledOnce();
  });
});
