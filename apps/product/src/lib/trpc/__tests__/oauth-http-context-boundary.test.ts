import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyAccessToken = vi.hoisted(() => vi.fn());
const createServiceRoleClient = vi.hoisted(() => vi.fn(() => ({ kind: 'service-role' })));

vi.mock('@/lib/mcp/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/auth')>()),
  verifyAccessToken,
}));
vi.mock('@/lib/supabase/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/oauth')>()),
  createServiceRoleClient,
}));

import { createFetchTRPCContext } from '../context';

describe('public OAuth HTTP context boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Bearer requestをtoken DB lookupより前に拒否する', async () => {
    await expect(
      createFetchTRPCContext({
        req: new Request('https://app.dayopt.app/api/trpc/plans.list', {
          method: 'POST',
          headers: { authorization: 'Bearer opaque-token' },
        }),
        resHeaders: new Headers(),
      } as never),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'OAuth tokens are accepted only through the MCP endpoint',
    });

    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
