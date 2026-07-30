import { beforeEach, describe, expect, it, vi } from 'vitest';

const createCaller = vi.hoisted(() => vi.fn(() => ({ caller: true })));
const supabase = vi.hoisted(() => ({ kind: 'service-role' }));

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => supabase,
}));
vi.mock('@/lib/trpc/root', () => ({
  appRouter: { createCaller },
}));

import { createMcpTrpcCaller } from '../trpc-bridge';

describe('createMcpTrpcCaller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verified bindingとHTTPから作れないinternal execution markerを注入する', () => {
    expect(
      createMcpTrpcCaller({
        userId: 'user-1',
        clientId: 'chatgpt',
        scopes: ['read:entries'],
      }),
    ).toEqual({ caller: true });

    expect(createCaller).toHaveBeenCalledWith({
      req: { headers: {}, cookies: {} },
      res: {},
      userId: 'user-1',
      oauthClientId: 'chatgpt',
      oauthScopes: ['read:entries'],
      oauthExecution: 'mcp_internal',
      supabase,
      authMode: 'oauth',
    });
  });

  it('request cancellation signalを内部tRPC contextへ渡す', () => {
    const signal = new AbortController().signal;

    createMcpTrpcCaller({
      userId: 'user-1',
      clientId: 'cursor',
      scopes: ['read:constraints'],
      signal,
    });

    expect(createCaller).toHaveBeenCalledWith(
      expect.objectContaining({
        req: { headers: {}, cookies: {}, signal },
      }),
    );
  });
});
