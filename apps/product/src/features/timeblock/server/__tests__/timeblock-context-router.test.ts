import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory, createTRPCRouter } from '@/lib/trpc/procedures';

const getRevision = vi.hoisted(() => vi.fn());
const getConstraints = vi.hoisted(() => vi.fn());

vi.mock('../timeblock-context-service', () => ({
  createTimeblockContextService: () => ({ getConstraints, getRevision }),
}));

import { timeblockContextRouter } from '../timeblock-context-router';

const createCaller = createCallerFactory(
  createTRPCRouter({ timeblockContext: timeblockContextRouter }),
);

describe('timeblock context router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRevision.mockResolvedValue({ revision: '42' });
    getConstraints.mockResolvedValue({
      asOf: '2026-07-24T10:00:00.000Z',
      timezone: 'Asia/Tokyo',
      occupancy: { plans: [], records: [] },
    });
  });

  it('sessionのverified user IDでrevisionを取得する', async () => {
    await expect(
      createCaller(createMockContext({ userId: 'user-1' })).timeblockContext.getRevision(),
    ).resolves.toEqual({ revision: '42' });
    expect(getRevision).toHaveBeenCalledWith('user-1');
  });

  it('未認証requestを拒否する', async () => {
    await expect(
      createCaller(createMockContext({ userId: undefined })).timeblockContext.getRevision(),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getRevision).not.toHaveBeenCalled();
  });

  it('sessionのverified user IDでconstraintsを取得する', async () => {
    const context = createMockContext({ userId: 'user-1' });
    const input = {
      startDate: '2026-07-20T00:00:00+09:00',
      endDate: '2026-07-27T00:00:00+09:00',
    };

    await expect(
      createCaller(context).timeblockContext.getConstraints(input),
    ).resolves.toMatchObject({
      timezone: 'Asia/Tokyo',
    });
    expect(getConstraints).toHaveBeenCalledWith('user-1', input, undefined);
  });

  it('constraintsのunknown fieldと31日超過をhandler前に拒否する', async () => {
    const context = createMockContext({ userId: 'user-1' });

    await expect(
      createCaller(context).timeblockContext.getConstraints({
        startDate: '2026-01-01T00:00:00+09:00',
        endDate: '2026-02-01T00:00:00.001+09:00',
        userId: 'foreign-user',
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(getConstraints).not.toHaveBeenCalled();
  });

  it('OAuthはread:constraintsでgetConstraintsだけを許可する', async () => {
    const context = Object.assign(createMockContext({ userId: 'user-1' }), {
      authMode: 'oauth' as const,
      oauthScopes: ['read:constraints'] as const,
      oauthExecution: 'mcp_internal' as const,
    });
    const input = {
      startDate: '2026-07-20T00:00:00+09:00',
      endDate: '2026-07-27T00:00:00+09:00',
    };

    await expect(createCaller(context).timeblockContext.getRevision()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(getRevision).not.toHaveBeenCalled();
    await expect(
      createCaller(context).timeblockContext.getConstraints(input),
    ).resolves.toMatchObject({ timezone: 'Asia/Tokyo' });
    expect(getConstraints).toHaveBeenCalledWith('user-1', input, undefined);
  });
});
