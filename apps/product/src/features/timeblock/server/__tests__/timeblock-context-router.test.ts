import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const getRevision = vi.hoisted(() => vi.fn());

vi.mock('../timeblock-context-service', () => ({
  createTimeblockContextService: () => ({ getRevision }),
}));

import { timeblockContextRouter } from '../timeblock-context-router';

const createCaller = createCallerFactory(timeblockContextRouter);

describe('timeblock context router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRevision.mockResolvedValue({ revision: '42' });
  });

  it('sessionのverified user IDでrevisionを取得する', async () => {
    await expect(
      createCaller(createMockContext({ userId: 'user-1' })).getRevision(),
    ).resolves.toEqual({ revision: '42' });
    expect(getRevision).toHaveBeenCalledWith('user-1');
  });

  it('未認証requestを拒否する', async () => {
    await expect(
      createCaller(createMockContext({ userId: undefined })).getRevision(),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getRevision).not.toHaveBeenCalled();
  });

  it('OAuth procedure allowlistに入るまでは拒否する', async () => {
    const context = Object.assign(createMockContext({ userId: 'user-1' }), {
      authMode: 'oauth' as const,
      oauthScopes: ['read:entries'] as const,
    });

    await expect(createCaller(context).getRevision()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(getRevision).not.toHaveBeenCalled();
  });
});
