import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory, createTRPCRouter } from '@/lib/trpc/procedures';

const list = vi.hoisted(() => vi.fn());
const listForMcp = vi.hoisted(() => vi.fn());

vi.mock('../tag-service', () => ({
  createTagService: () => ({ list, listForMcp }),
}));

import { tagsRouter } from '../router';

const createCaller = createCallerFactory(createTRPCRouter({ tags: tagsRouter }));

describe('tags router MCP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue([]);
    listForMcp.mockResolvedValue([]);
  });

  it('MCP内部callerはread:tagsでnarrow queryを使う', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:tags'],
    });

    await expect(createCaller(context).tags.list()).resolves.toEqual({ data: [], count: 0 });
    expect(listForMcp).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(list).not.toHaveBeenCalled();
  });

  it('MCP内部callerでもwrong scopeならhandler前に拒否する', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthExecution: 'mcp_internal',
      oauthScopes: ['read:constraints'],
    });

    await expect(createCaller(context).tags.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(listForMcp).not.toHaveBeenCalled();
  });

  it('公開OAuth callerはread:tagsがあっても拒否する', async () => {
    const context = createMockContext({
      userId: 'user-1',
      authMode: 'oauth',
      oauthScopes: ['read:tags'],
    });

    await expect(createCaller(context).tags.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(listForMcp).not.toHaveBeenCalled();
  });

  it('session callerは既存queryを維持する', async () => {
    const context = createMockContext({ userId: 'user-1', authMode: 'session' });

    await expect(createCaller(context).tags.list()).resolves.toEqual({ data: [], count: 0 });
    expect(list).toHaveBeenCalledWith({
      userId: 'user-1',
      sortField: undefined,
      sortOrder: undefined,
    });
    expect(listForMcp).not.toHaveBeenCalled();
  });
});
