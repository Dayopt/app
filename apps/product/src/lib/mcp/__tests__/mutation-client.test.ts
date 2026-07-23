import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpMutationClient } from '../mutation-client';

const mocks = vi.hoisted(() => ({
  applyPlanCreate: vi.fn(),
  captureUnexpectedDatabaseError: vi.fn(
    (error: Error, _context?: Record<string, unknown>) => error,
  ),
}));

vi.mock('../mutation-db', () => ({
  createMcpMutationDb: () => ({ applyPlanCreate: mocks.applyPlanCreate }),
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
    ['DT001', 'NOT_FOUND'],
    ['23P01', 'TIME_OVERLAP'],
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
});
