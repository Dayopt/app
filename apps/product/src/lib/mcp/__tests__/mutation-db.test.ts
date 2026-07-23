import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-sentinel',
  },
}));

import { createMcpMutationDb } from '../mutation-db';

const createArgs = {
  p_access_token_id: '00000000-0000-4000-8000-000000000001',
  p_connection_id: '00000000-0000-4000-8000-000000000002',
  p_operation_id: '00000000-0000-4000-8000-000000000003',
  p_title: 'Plan',
  p_note: null,
  p_tag_id: null,
  p_start_at: '2026-07-24T01:00:00.000000Z',
  p_end_at: '2026-07-24T02:00:00.000000Z',
};

const updateArgs = {
  p_access_token_id: createArgs.p_access_token_id,
  p_connection_id: createArgs.p_connection_id,
  p_operation_id: createArgs.p_operation_id,
  p_plan_id: '00000000-0000-4000-8000-000000000004',
  p_expected_updated_at: '2026-07-23T12:34:56.123456Z',
  p_title_present: true,
  p_title: 'Updated Plan',
  p_note_present: true,
  p_note: null,
  p_tag_id_present: false,
  p_tag_id: null,
  p_start_at_present: false,
  p_start_at: null,
  p_end_at_present: false,
  p_end_at: null,
};

const versionedArgs = {
  p_access_token_id: createArgs.p_access_token_id,
  p_connection_id: createArgs.p_connection_id,
  p_operation_id: createArgs.p_operation_id,
  p_plan_id: updateArgs.p_plan_id,
  p_expected_updated_at: updateArgs.p_expected_updated_at,
};

describe('MCP mutation DB boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('raw service-role clientを返さず、4つのtyped Plan applyだけを公開する', async () => {
    const db = createMcpMutationDb();

    expect(Object.keys(db)).toEqual([
      'applyPlanCreate',
      'applyPlanUpdate',
      'applyPlanDelete',
      'applyPlanRestore',
    ]);
    await db.applyPlanCreate(createArgs);
    await db.applyPlanUpdate(updateArgs);
    await db.applyPlanDelete(versionedArgs);
    await db.applyPlanRestore(versionedArgs);

    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-sentinel',
      expect.objectContaining({
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: expect.any(Function) },
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'apply_mcp_plan_create_v1', createArgs);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'apply_mcp_plan_update_v1', updateArgs);
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, 'apply_mcp_plan_delete_v1', versionedArgs);
    expect(mocks.rpc).toHaveBeenNthCalledWith(4, 'apply_mcp_plan_restore_v1', versionedArgs);
  });

  it('認証付きRPC builderを外へ返さずplain resultだけを返す', async () => {
    const fetchSentinel = vi.fn();
    const builder = {
      fetch: fetchSentinel,
      then: (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    mocks.rpc.mockReturnValue(builder);
    const db = createMcpMutationDb();

    const pending = db.applyPlanCreate(createArgs);

    expect(pending).not.toBe(builder);
    expect(pending).not.toHaveProperty('fetch');
    await expect(pending).resolves.toEqual({ data: [], error: null });
    expect(fetchSentinel).not.toHaveBeenCalled();
  });
});
