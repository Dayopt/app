import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { McpMutationDatabase } from '../mutation-db';

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

const args = {
  p_access_token_id: '00000000-0000-4000-8000-000000000001',
  p_connection_id: '00000000-0000-4000-8000-000000000002',
  p_operation_id: '00000000-0000-4000-8000-000000000003',
  p_title: 'Plan',
  p_note: null,
  p_tag_id: null,
  p_start_at: '2026-07-24T01:00:00.000000Z',
  p_end_at: '2026-07-24T02:00:00.000000Z',
};

describe('MCP mutation DB boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('table surfaceを型上も閉じる', () => {
    expectTypeOf<keyof McpMutationDatabase['public']['Tables']>().toEqualTypeOf<never>();
  });

  it('raw service-role clientを返さず、typed Plan applyだけを公開する', async () => {
    const db = createMcpMutationDb();

    expect(Object.keys(db)).toEqual(['applyPlanCreate']);
    await db.applyPlanCreate(args);

    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-sentinel',
      expect.objectContaining({
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: expect.any(Function) },
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith('apply_mcp_plan_create_v1', args);
  });
});
