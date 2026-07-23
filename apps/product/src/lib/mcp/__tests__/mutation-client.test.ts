import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpMutationClient } from '../mutation-client';

const mocks = vi.hoisted(() => ({
  applyPlanCreate: vi.fn(),
  applyPlanDelete: vi.fn(),
  applyPlanRestore: vi.fn(),
  applyPlanUpdate: vi.fn(),
  applyRecordCreate: vi.fn(),
  applyRecordDelete: vi.fn(),
  applyRecordRestore: vi.fn(),
  applyRecordUpdate: vi.fn(),
  captureUnexpectedDatabaseError: vi.fn(
    (error: Error, _context?: Record<string, unknown>) => error,
  ),
}));

vi.mock('../mutation-db', () => ({
  createMcpMutationDb: () => ({
    applyPlanCreate: mocks.applyPlanCreate,
    applyPlanDelete: mocks.applyPlanDelete,
    applyPlanRestore: mocks.applyPlanRestore,
    applyPlanUpdate: mocks.applyPlanUpdate,
    applyRecordCreate: mocks.applyRecordCreate,
    applyRecordDelete: mocks.applyRecordDelete,
    applyRecordRestore: mocks.applyRecordRestore,
    applyRecordUpdate: mocks.applyRecordUpdate,
  }),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: mocks.captureUnexpectedDatabaseError,
}));

const input = {
  connectionId: '00000000-0000-4000-8000-000000000001',
  accessTokenId: '00000000-0000-4000-8000-000000000002',
  operationId: '00000000-0000-4000-8000-000000000003',
  title: 'Private title',
  note: 'Private note',
  tagId: null,
  startAt: '2026-07-24T01:00:00.000000Z',
  endAt: '2026-07-24T02:00:00.000000Z',
};

const receipt = {
  schema_version: 1,
  operation_id: input.operationId,
  resource_type: 'plan',
  resource_id: '00000000-0000-4000-8000-000000000004',
  version: '2026-07-23T12:34:56.123456Z',
  deleted_at: null,
  replayed: false,
};

const versionedInput = {
  connectionId: input.connectionId,
  accessTokenId: input.accessTokenId,
  operationId: input.operationId,
  planId: receipt.resource_id,
  expectedUpdatedAt: receipt.version,
};

const deletedReceipt = {
  ...receipt,
  deleted_at: '2026-07-23T12:35:00.654321Z',
};

const recordInput = {
  connectionId: input.connectionId,
  accessTokenId: input.accessTokenId,
  operationId: '00000000-0000-4000-8000-000000000005',
  title: 'Private record title',
  note: 'Private record note',
  tagId: null,
  planId: '00000000-0000-4000-8000-000000000006',
  startAt: '2026-07-23T01:00:00.000000Z',
  endAt: '2026-07-23T02:00:00.000000Z',
};

const recordReceipt = {
  schema_version: 1,
  operation_id: recordInput.operationId,
  resource_type: 'record',
  resource_id: '00000000-0000-4000-8000-000000000007',
  version: '2026-07-23T12:36:56.123456Z',
  deleted_at: null,
  replayed: false,
};

const recordVersionedInput = {
  connectionId: recordInput.connectionId,
  accessTokenId: recordInput.accessTokenId,
  operationId: recordInput.operationId,
  recordId: recordReceipt.resource_id,
  expectedUpdatedAt: recordReceipt.version,
};

const deletedRecordReceipt = {
  ...recordReceipt,
  deleted_at: '2026-07-23T12:37:00.654321Z',
};

describe('McpMutationClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('typed Plan createだけをRPCへ渡し、raw timestamptz versionを保つ', async () => {
    mocks.applyPlanCreate.mockResolvedValue({ data: [receipt], error: null });

    await expect(new McpMutationClient().createPlan(input)).resolves.toEqual({
      schemaVersion: 1,
      operationId: input.operationId,
      resourceType: 'plan',
      resourceId: receipt.resource_id,
      version: '2026-07-23T12:34:56.123456Z',
      deletedAt: null,
      replayed: false,
    });
    expect(mocks.applyPlanCreate).toHaveBeenCalledWith({
      p_access_token_id: input.accessTokenId,
      p_connection_id: input.connectionId,
      p_end_at: input.endAt,
      p_note: input.note,
      p_operation_id: input.operationId,
      p_start_at: input.startAt,
      p_tag_id: null,
      p_title: input.title,
    });
  });

  it('partial Plan updateのfield presenceと明示nullをそのままRPCへ渡す', async () => {
    mocks.applyPlanUpdate.mockResolvedValue({ data: [receipt], error: null });

    await expect(
      new McpMutationClient().updatePlan({
        ...versionedInput,
        title: 'Updated title',
        note: null,
        tagId: null,
        endAt: '2026-07-24T03:00:00.000000Z',
      }),
    ).resolves.toEqual({
      schemaVersion: 1,
      operationId: input.operationId,
      resourceType: 'plan',
      resourceId: receipt.resource_id,
      version: receipt.version,
      deletedAt: null,
      replayed: false,
    });
    expect(mocks.applyPlanUpdate).toHaveBeenCalledWith({
      p_access_token_id: input.accessTokenId,
      p_connection_id: input.connectionId,
      p_end_at: '2026-07-24T03:00:00.000000Z',
      p_end_at_present: true,
      p_expected_updated_at: receipt.version,
      p_note: null,
      p_note_present: true,
      p_operation_id: input.operationId,
      p_plan_id: receipt.resource_id,
      p_start_at: null,
      p_start_at_present: false,
      p_tag_id: null,
      p_tag_id_present: true,
      p_title: 'Updated title',
      p_title_present: true,
    });
  });

  it('Plan updateもdeadlockだけを一度再試行する', async () => {
    mocks.applyPlanUpdate
      .mockResolvedValueOnce({ data: null, error: { code: '40P01' } })
      .mockResolvedValueOnce({ data: [receipt], error: null });

    await expect(
      new McpMutationClient().updatePlan({ ...versionedInput, title: 'Retry update' }),
    ).resolves.toMatchObject({ resourceId: receipt.resource_id, version: receipt.version });
    expect(mocks.applyPlanUpdate).toHaveBeenCalledTimes(2);
  });

  it('Plan deleteのraw versionとnon-null deletedAtを保つ', async () => {
    mocks.applyPlanDelete.mockResolvedValue({ data: [deletedReceipt], error: null });

    await expect(new McpMutationClient().deletePlan(versionedInput)).resolves.toEqual({
      schemaVersion: 1,
      operationId: input.operationId,
      resourceType: 'plan',
      resourceId: receipt.resource_id,
      version: receipt.version,
      deletedAt: deletedReceipt.deleted_at,
      replayed: false,
    });
    expect(mocks.applyPlanDelete).toHaveBeenCalledWith({
      p_access_token_id: input.accessTokenId,
      p_connection_id: input.connectionId,
      p_expected_updated_at: receipt.version,
      p_operation_id: input.operationId,
      p_plan_id: receipt.resource_id,
    });
  });

  it('Plan restoreはactive receiptだけを返す', async () => {
    mocks.applyPlanRestore.mockResolvedValue({ data: [receipt], error: null });

    await expect(new McpMutationClient().restorePlan(versionedInput)).resolves.toEqual({
      schemaVersion: 1,
      operationId: input.operationId,
      resourceType: 'plan',
      resourceId: receipt.resource_id,
      version: receipt.version,
      deletedAt: null,
      replayed: false,
    });
    expect(mocks.applyPlanRestore).toHaveBeenCalledWith({
      p_access_token_id: input.accessTokenId,
      p_connection_id: input.connectionId,
      p_expected_updated_at: receipt.version,
      p_operation_id: input.operationId,
      p_plan_id: receipt.resource_id,
    });
  });

  it('typed Record createだけをRPCへ渡し、完了Planへのlinkを保つ', async () => {
    mocks.applyRecordCreate.mockResolvedValue({ data: [recordReceipt], error: null });

    await expect(new McpMutationClient().createRecord(recordInput)).resolves.toEqual({
      schemaVersion: 1,
      operationId: recordInput.operationId,
      resourceType: 'record',
      resourceId: recordReceipt.resource_id,
      version: recordReceipt.version,
      deletedAt: null,
      replayed: false,
    });
    expect(mocks.applyRecordCreate).toHaveBeenCalledWith({
      p_access_token_id: recordInput.accessTokenId,
      p_connection_id: recordInput.connectionId,
      p_end_at: recordInput.endAt,
      p_note: recordInput.note,
      p_operation_id: recordInput.operationId,
      p_plan_id: recordInput.planId,
      p_start_at: recordInput.startAt,
      p_tag_id: null,
      p_title: recordInput.title,
    });
  });

  it('partial Record updateのfield presenceと明示nullを渡し、Plan linkを変更しない', async () => {
    mocks.applyRecordUpdate.mockResolvedValue({ data: [recordReceipt], error: null });

    await expect(
      new McpMutationClient().updateRecord({
        ...recordVersionedInput,
        title: 'Updated record',
        note: null,
        tagId: null,
        endAt: '2026-07-23T03:00:00.000000Z',
      }),
    ).resolves.toMatchObject({
      resourceType: 'record',
      resourceId: recordReceipt.resource_id,
      version: recordReceipt.version,
    });
    expect(mocks.applyRecordUpdate).toHaveBeenCalledWith({
      p_access_token_id: recordInput.accessTokenId,
      p_connection_id: recordInput.connectionId,
      p_end_at: '2026-07-23T03:00:00.000000Z',
      p_end_at_present: true,
      p_expected_updated_at: recordReceipt.version,
      p_note: null,
      p_note_present: true,
      p_operation_id: recordInput.operationId,
      p_record_id: recordReceipt.resource_id,
      p_start_at: null,
      p_start_at_present: false,
      p_tag_id: null,
      p_tag_id_present: true,
      p_title: 'Updated record',
      p_title_present: true,
    });
    expect(mocks.applyRecordUpdate.mock.calls[0]?.[0]).not.toHaveProperty('p_plan_id');
  });

  it('Record updateもdeadlockだけを一度再試行する', async () => {
    mocks.applyRecordUpdate
      .mockResolvedValueOnce({ data: null, error: { code: '40P01' } })
      .mockResolvedValueOnce({ data: [recordReceipt], error: null });

    await expect(
      new McpMutationClient().updateRecord({
        ...recordVersionedInput,
        title: 'Retry record update',
      }),
    ).resolves.toMatchObject({ resourceId: recordReceipt.resource_id });
    expect(mocks.applyRecordUpdate).toHaveBeenCalledTimes(2);
  });

  it('Record deleteはdeleted receipt、restoreはactive receiptだけを返す', async () => {
    mocks.applyRecordDelete.mockResolvedValue({ data: [deletedRecordReceipt], error: null });
    mocks.applyRecordRestore.mockResolvedValue({ data: [recordReceipt], error: null });
    const client = new McpMutationClient();

    await expect(client.deleteRecord(recordVersionedInput)).resolves.toMatchObject({
      resourceType: 'record',
      resourceId: recordReceipt.resource_id,
      deletedAt: deletedRecordReceipt.deleted_at,
    });
    await expect(client.restoreRecord(recordVersionedInput)).resolves.toMatchObject({
      resourceType: 'record',
      resourceId: recordReceipt.resource_id,
      deletedAt: null,
    });
    expect(mocks.applyRecordDelete).toHaveBeenCalledWith({
      p_access_token_id: recordInput.accessTokenId,
      p_connection_id: recordInput.connectionId,
      p_expected_updated_at: recordReceipt.version,
      p_operation_id: recordInput.operationId,
      p_record_id: recordReceipt.resource_id,
    });
    expect(mocks.applyRecordRestore).toHaveBeenCalledWith({
      p_access_token_id: recordInput.accessTokenId,
      p_connection_id: recordInput.connectionId,
      p_expected_updated_at: recordReceipt.version,
      p_operation_id: recordInput.operationId,
      p_record_id: recordReceipt.resource_id,
    });
  });

  it.each([
    {
      caseName: 'different resource type',
      method: 'update',
      receipt: { ...recordReceipt, resource_type: 'plan' },
    },
    {
      caseName: 'different Record ID',
      method: 'update',
      receipt: { ...recordReceipt, resource_id: '00000000-0000-4000-8000-000000000099' },
    },
    { caseName: 'active delete receipt', method: 'delete', receipt: recordReceipt },
    { caseName: 'deleted restore receipt', method: 'restore', receipt: deletedRecordReceipt },
  ])('$caseNameをRecord receipt invariant違反として扱う', async ({ method, receipt: row }) => {
    const client = new McpMutationClient();
    if (method === 'update') {
      mocks.applyRecordUpdate.mockResolvedValue({ data: [row], error: null });
      await expect(
        client.updateRecord({ ...recordVersionedInput, title: 'Invalid receipt' }),
      ).rejects.toMatchObject({ code: 'MUTATION_FAILED' });
      return;
    }
    if (method === 'delete') {
      mocks.applyRecordDelete.mockResolvedValue({ data: [row], error: null });
      await expect(client.deleteRecord(recordVersionedInput)).rejects.toMatchObject({
        code: 'MUTATION_FAILED',
      });
      return;
    }
    mocks.applyRecordRestore.mockResolvedValue({ data: [row], error: null });
    await expect(client.restoreRecord(recordVersionedInput)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
  });

  it('unexpected Record DB failureもcodeだけを観測し、入力本文を捨てる', async () => {
    mocks.applyRecordCreate.mockResolvedValue({
      data: null,
      error: {
        code: 'XX998',
        message: `${recordInput.title} ${recordInput.note} dop_at_secret-token`,
      },
    });

    await expect(new McpMutationClient().createRecord(recordInput)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
    const [captured, context] = mocks.captureUnexpectedDatabaseError.mock.calls[0]!;
    expect(captured).toMatchObject({
      code: 'XX998',
      message: 'Unexpected MCP mutation database failure',
    });
    expect(JSON.stringify({ captured, context })).not.toContain(recordInput.title);
    expect(JSON.stringify({ captured, context })).not.toContain(recordInput.note);
    expect(JSON.stringify({ captured, context })).not.toContain('dop_at_secret-token');
    expect(context).toEqual({ feature: 'mcp', operation: 'apply_mcp_record_create' });
  });

  it('deadlockだけを一度再試行し、最終DB outcomeをstable errorへ変換する', async () => {
    mocks.applyPlanCreate
      .mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock detail' } })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23P01', message: 'private exclusion detail' },
      });

    await expect(new McpMutationClient().createPlan(input)).rejects.toMatchObject({
      code: 'TIME_OVERLAP',
      message: 'This time range overlaps with an existing item.',
    });
    expect(mocks.applyPlanCreate).toHaveBeenCalledTimes(2);
    expect(mocks.captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it('deadlockが二度続いた場合はCONFLICTとして終了する', async () => {
    mocks.applyPlanCreate.mockResolvedValue({
      data: null,
      error: { code: '40P01', message: 'private deadlock detail' },
    });

    await expect(new McpMutationClient().createPlan(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(mocks.applyPlanCreate).toHaveBeenCalledTimes(2);
    expect(mocks.captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it.each([
    ['DM003', 'WRITE_DISABLED'],
    ['DM004', 'AUTHORIZATION_LOST'],
    ['DM005', 'PRO_REQUIRED'],
    ['DM006', 'IDEMPOTENCY_KEY_REUSED'],
    ['22004', 'INVALID_INPUT'],
    ['22023', 'INVALID_INPUT'],
    ['DT003', 'INVALID_TIME_RANGE'],
    ['DT004', 'PLAN_IN_PAST'],
    ['DT013', 'PLAN_NOT_RECORDABLE'],
    ['DT002', 'CONFLICT'],
    ['DT006', 'PLAN_TIME_LOCKED'],
    ['DT001', 'NOT_FOUND'],
    ['23P01', 'TIME_OVERLAP'],
    ['55P03', 'CONFLICT'],
    ['57014', 'CONFLICT'],
  ])('%sを%sへ変換し、DB messageを返さない', async (databaseCode, expectedCode) => {
    mocks.applyPlanCreate.mockResolvedValue({
      data: null,
      error: { code: databaseCode, message: 'private title and token detail' },
    });

    const error = await new McpMutationClient().createPlan(input).catch((caught) => caught);
    expect(error).toMatchObject({ code: expectedCode });
    expect(error.message).not.toContain('private');
    expect(error.message).not.toContain(input.title);
    expect(mocks.captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it.each(['23505', '23514', '42501', 'DM002', 'DM007', 'P0002'])(
    '%sを利用者起因へ丸めず、内部invariant failureとして観測する',
    async (databaseCode) => {
      mocks.applyPlanCreate.mockResolvedValue({
        data: null,
        error: { code: databaseCode, message: 'private database detail' },
      });

      await expect(new McpMutationClient().createPlan(input)).rejects.toMatchObject({
        code: 'MUTATION_FAILED',
      });
      expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: databaseCode,
          message: 'Unexpected MCP mutation database failure',
        }),
        { feature: 'mcp', operation: 'apply_mcp_plan_create' },
      );
    },
  );

  it('unexpected DB failureはcodeだけを観測し、raw messageと入力本文を捨てる', async () => {
    mocks.applyPlanCreate.mockResolvedValue({
      data: null,
      error: {
        code: 'XX999',
        message: `${input.title} ${input.note} dop_at_secret-token`,
      },
    });

    const error = await new McpMutationClient().createPlan(input).catch((caught) => caught);
    expect(error).toMatchObject({
      code: 'MUTATION_FAILED',
      message: 'Dayopt could not apply the change.',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    const [captured, context] = mocks.captureUnexpectedDatabaseError.mock.calls[0]!;
    expect(captured).toMatchObject({
      code: 'XX999',
      message: 'Unexpected MCP mutation database failure',
    });
    expect(captured.cause).toBeUndefined();
    expect(JSON.stringify({ captured, context })).not.toContain(input.title);
    expect(JSON.stringify({ captured, context })).not.toContain(input.note);
    expect(JSON.stringify({ captured, context })).not.toContain('dop_at_secret-token');
    expect(context).toEqual({ feature: 'mcp', operation: 'apply_mcp_plan_create' });
  });

  it('malformed DB codeも観測contextへ残さない', async () => {
    mocks.applyPlanCreate.mockResolvedValue({
      data: null,
      error: {
        code: `private-${input.title}-dop_at_secret-token`,
        message: 'private database detail',
      },
    });

    await expect(new McpMutationClient().createPlan(input)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_create' },
    );
    expect(JSON.stringify(mocks.captureUnexpectedDatabaseError.mock.calls)).not.toContain(
      input.title,
    );
    expect(JSON.stringify(mocks.captureUnexpectedDatabaseError.mock.calls)).not.toContain(
      'dop_at_secret-token',
    );
  });

  it('throwされたDB failureもcodeだけを観測し、raw errorをcauseへ残さない', async () => {
    mocks.applyPlanCreate.mockRejectedValue(
      Object.assign(new Error(`${input.title} ${input.note} dop_at_secret-token`), {
        code: 'PGRST500',
      }),
    );

    const error = await new McpMutationClient().createPlan(input).catch((caught) => caught);
    expect(error).toMatchObject({
      code: 'MUTATION_FAILED',
    });
    const [captured] = mocks.captureUnexpectedDatabaseError.mock.calls[0]!;
    expect(captured).toMatchObject({
      code: 'PGRST500',
      message: 'Unexpected MCP mutation database failure',
    });
    expect(captured.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(input.title);
    expect(JSON.stringify(error)).not.toContain(input.note);
    expect(JSON.stringify(error)).not.toContain('dop_at_secret-token');
  });

  it.each([
    { caseName: 'empty', data: [] },
    { caseName: 'multiple', data: [receipt, receipt] },
    {
      caseName: 'malformed',
      data: [{ ...receipt, schema_version: 2, version: null }],
    },
    {
      caseName: 'different operation',
      data: [{ ...receipt, operation_id: '00000000-0000-4000-8000-000000000099' }],
    },
  ])('$caseName receiptを内部異常として扱う', async ({ data }) => {
    mocks.applyPlanCreate.mockResolvedValue({ data, error: null });

    await expect(new McpMutationClient().createPlan(input)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_RECEIPT' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_create' },
    );
  });

  it('updateでdeleted receiptを受け取った場合は内部異常として扱う', async () => {
    mocks.applyPlanUpdate.mockResolvedValue({ data: [deletedReceipt], error: null });

    await expect(
      new McpMutationClient().updatePlan({ ...versionedInput, title: 'Invalid receipt' }),
    ).rejects.toMatchObject({ code: 'MUTATION_FAILED' });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_RECEIPT' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_update' },
    );
  });

  it('deleteでactive receiptを受け取った場合は内部異常として扱う', async () => {
    mocks.applyPlanDelete.mockResolvedValue({ data: [receipt], error: null });

    await expect(new McpMutationClient().deletePlan(versionedInput)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_RECEIPT' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_delete' },
    );
  });

  it('restoreでdeleted receiptを受け取った場合は内部異常として扱う', async () => {
    mocks.applyPlanRestore.mockResolvedValue({ data: [deletedReceipt], error: null });

    await expect(new McpMutationClient().restorePlan(versionedInput)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_RECEIPT' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_restore' },
    );
  });

  it('update receiptを要求Plan IDへbindする', async () => {
    mocks.applyPlanUpdate.mockResolvedValue({
      data: [{ ...receipt, resource_id: '00000000-0000-4000-8000-000000000099' }],
      error: null,
    });

    await expect(
      new McpMutationClient().updatePlan({ ...versionedInput, title: 'Wrong resource' }),
    ).rejects.toMatchObject({ code: 'MUTATION_FAILED' });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_RECEIPT' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_update' },
    );
  });

  it('delete receiptを要求Plan IDへbindする', async () => {
    mocks.applyPlanDelete.mockResolvedValue({
      data: [{ ...deletedReceipt, resource_id: '00000000-0000-4000-8000-000000000099' }],
      error: null,
    });

    await expect(new McpMutationClient().deletePlan(versionedInput)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_RECEIPT' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_delete' },
    );
  });

  it('restore receiptを要求Plan IDへbindする', async () => {
    mocks.applyPlanRestore.mockResolvedValue({
      data: [{ ...receipt, resource_id: '00000000-0000-4000-8000-000000000099' }],
      error: null,
    });

    await expect(new McpMutationClient().restorePlan(versionedInput)).rejects.toMatchObject({
      code: 'MUTATION_FAILED',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_RECEIPT' }),
      { feature: 'mcp', operation: 'apply_mcp_plan_restore' },
    );
  });
});
