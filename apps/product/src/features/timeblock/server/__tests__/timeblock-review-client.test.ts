import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ from, rpc }),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: (error: unknown) =>
    error instanceof Error ? error : new Error('database review read failed'),
}));

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { TimeblockReviewClient } from '../timeblock-review-client';

const input = {
  userId: 'user-1',
  lane: 'plans' as const,
  startDate: '2026-07-20T00:00:00+09:00',
  endDate: '2026-07-27T00:00:00+09:00',
  offset: 0,
  limit: 1_000,
};

function createReviewQuery(
  data: unknown[],
  count: number | null,
  error: { message: string; code?: string } | null = null,
) {
  const query = createChainableMock(data, error);
  query.then!.mockImplementation((resolve: (value: unknown) => void) =>
    resolve({ data, error, count }),
  );
  return query;
}

describe('TimeblockReviewClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('owner・active・tagged・start range・決定順・最小projectionを固定する', async () => {
    const query = createReviewQuery(
      [
        {
          id: 'plan-1',
          tag_id: '00000000-0000-4000-8000-000000000001',
          start_at: '2026-07-24T10:00:00.000Z',
          end_at: '2026-07-24T11:00:00.000Z',
        },
      ],
      1,
    );
    from.mockReturnValue(query);
    const signal = new AbortController().signal;

    await expect(new TimeblockReviewClient().listReviewPage(input, signal)).resolves.toEqual({
      rows: [
        {
          id: 'plan-1',
          tagId: '00000000-0000-4000-8000-000000000001',
          startAt: '2026-07-24T10:00:00.000Z',
          endAt: '2026-07-24T11:00:00.000Z',
        },
      ],
      totalCount: 1,
    });

    expect(from).toHaveBeenCalledWith('plans');
    expect(query.select).toHaveBeenCalledWith('id,tag_id,start_at,end_at', {
      count: 'exact',
    });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.not).toHaveBeenCalledWith('tag_id', 'is', null);
    expect(query.gte).toHaveBeenCalledWith('start_at', input.startDate);
    expect(query.lt).toHaveBeenCalledWith('start_at', input.endDate);
    expect(query.order).toHaveBeenNthCalledWith(1, 'start_at', { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, 999);
    expect(query.abortSignal).toHaveBeenCalledWith(signal);
  });

  it('後続pageでは重いexact countを再取得しない', async () => {
    const query = createReviewQuery([], null);
    from.mockReturnValue(query);

    await new TimeblockReviewClient().listReviewPage({
      ...input,
      lane: 'records',
      offset: 1_000,
    });

    expect(from).toHaveBeenCalledWith('records');
    expect(query.select).toHaveBeenCalledWith('id,tag_id,start_at,end_at');
  });

  it('raw DB detailと予期しないuntagged rowをstable service errorへ変換する', async () => {
    const failedQuery = createReviewQuery([], null, {
      code: 'XX000',
      message: 'private review detail',
    });
    from.mockReturnValueOnce(failedQuery);

    const databaseError = await new TimeblockReviewClient()
      .listReviewPage(input)
      .catch((caught) => caught);
    expect(databaseError).toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to read timeblock review rows',
    });
    expect(String(databaseError)).not.toContain('private review detail');

    const untaggedQuery = createReviewQuery(
      [
        {
          id: 'plan-1',
          tag_id: null,
          start_at: '2026-07-24T10:00:00.000Z',
          end_at: '2026-07-24T11:00:00.000Z',
        },
      ],
      1,
    );
    from.mockReturnValueOnce(untaggedQuery);

    await expect(new TimeblockReviewClient().listReviewPage(input)).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Timeblock review query returned an untagged row',
    });
  });
});
