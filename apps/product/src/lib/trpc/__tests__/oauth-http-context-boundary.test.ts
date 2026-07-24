import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyAccessToken = vi.hoisted(() => vi.fn());
const createServiceRoleClient = vi.hoisted(() => vi.fn(() => ({ kind: 'service-role' })));
const handler = vi.hoisted(() => vi.fn(() => 'ok'));

vi.mock('@/lib/mcp/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/auth')>()),
  verifyAccessToken,
}));
vi.mock('@/lib/supabase/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/oauth')>()),
  createServiceRoleClient,
}));

import { createFetchTRPCContext } from '../context';
import { createCallerFactory, createTRPCRouter, protectedProcedure } from '../procedures';

const testRouter = createTRPCRouter({
  plans: createTRPCRouter({
    list: protectedProcedure.query(() => handler()),
  }),
});
const createCaller = createCallerFactory(testRouter);

describe('public OAuth HTTP context boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessToken.mockResolvedValue({
      tokenId: 'token-1',
      connectionId: 'connection-1',
      userId: 'user-1',
      clientId: 'chatgpt',
      scopes: ['read:entries'],
      resourceUri: 'https://mcp.dayopt.app',
      expiresAt: 1_800_000_000,
    });
  });

  it('Bearer requestからinternal markerを作らずallowlist handlerを実行しない', async () => {
    const context = await createFetchTRPCContext({
      req: new Request('https://app.dayopt.app/api/trpc/plans.list', {
        method: 'POST',
        headers: { authorization: 'Bearer opaque-token' },
      }),
      resHeaders: new Headers(),
    } as never);

    expect(context).toMatchObject({
      authMode: 'oauth',
      userId: 'user-1',
      oauthClientId: 'chatgpt',
      oauthScopes: ['read:entries'],
    });
    expect(context.oauthExecution).toBeUndefined();
    await expect(createCaller(context).plans.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
