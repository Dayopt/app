import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';

import { createCallerFactory, createTRPCRouter, protectedProcedure } from '../procedures';

const handler = vi.fn(() => 'ok');
const unmappedHandler = vi.fn(() => 'unmapped');

const testRouter = createTRPCRouter({
  plans: createTRPCRouter({
    list: protectedProcedure.query(() => handler()),
  }),
  userSettings: createTRPCRouter({
    update: protectedProcedure.mutation(() => unmappedHandler()),
  }),
});

const createCaller = createCallerFactory(testRouter);

describe('OAuth tRPC execution boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('公開tRPC由来のOAuth contextをscopeがあっても拒否する', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthScopes: ['read:entries'],
    });

    await expect(createCaller(context).plans.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'OAuth tokens are accepted only through the MCP endpoint',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('MCP内部callerとexact scopeが揃ったprocedureだけを許可する', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:entries'],
    });

    await expect(createCaller(context).plans.list()).resolves.toBe('ok');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('MCP内部callerでもexact scopeがなければ拒否する', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:tags'],
    });

    await expect(createCaller(context).plans.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('MCP内部callerでもallowlistにないprocedureを拒否する', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:entries'],
    });

    await expect(createCaller(context).userSettings.update()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(unmappedHandler).not.toHaveBeenCalled();
  });

  it('session procedureの既存挙動は変えない', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'session',
    });

    await expect(createCaller(context).plans.list()).resolves.toBe('ok');
    expect(handler).toHaveBeenCalledOnce();
  });
});
