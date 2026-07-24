import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';

import { createCallerFactory, createTRPCRouter, protectedProcedure } from '../procedures';

const handler = vi.fn(() => 'ok');
const unmappedHandler = vi.fn(() => 'unmapped');
const tagsListHandler = vi.fn(() => 'tags');
const constraintsHandler = vi.fn(() => 'constraints');
const neighboringHandler = vi.fn(() => 'neighboring');

const testRouter = createTRPCRouter({
  plans: createTRPCRouter({
    list: protectedProcedure.query(() => handler()),
  }),
  tags: createTRPCRouter({
    list: protectedProcedure.query(() => tagsListHandler()),
    listHierarchy: protectedProcedure.query(() => neighboringHandler()),
  }),
  timeblockContext: createTRPCRouter({
    getConstraints: protectedProcedure.query(() => constraintsHandler()),
    getRevision: protectedProcedure.query(() => neighboringHandler()),
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

  it('新しいread scopeは対応するexact procedureだけを許可する', async () => {
    const tagsContext = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:tags'],
    });
    const constraintsContext = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:constraints'],
    });

    await expect(createCaller(tagsContext).tags.list()).resolves.toBe('tags');
    await expect(createCaller(constraintsContext).timeblockContext.getConstraints()).resolves.toBe(
      'constraints',
    );
    await expect(createCaller(tagsContext).timeblockContext.getConstraints()).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
      },
    );
  });

  it('同じrouterでも隣接procedureはOAuthへ公開しない', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:tags', 'read:constraints'],
    });

    await expect(createCaller(context).tags.listHierarchy()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(createCaller(context).timeblockContext.getRevision()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(neighboringHandler).not.toHaveBeenCalled();
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
