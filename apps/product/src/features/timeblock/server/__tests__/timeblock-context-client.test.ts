import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const single = vi.hoisted(() => vi.fn());
const abortSignal = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ from, rpc }),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: (error: unknown) =>
    error instanceof Error ? error : new Error('database marker read failed'),
}));

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { TimeblockContextClient } from '../timeblock-context-client';

describe('TimeblockContextClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const markerQuery = { abortSignal, single };
    abortSignal.mockReturnValue(markerQuery);
    rpc.mockReturnValue(markerQuery);
  });

  it('verified user IDだけをmarker RPCへ渡しdecimal revisionを保持する', async () => {
    single.mockResolvedValue({
      data: {
        revision: '9007199254740993',
        database_now: '2026-07-24T10:00:00.000Z',
        timezone: 'Asia/Tokyo',
      },
      error: null,
    });

    await expect(new TimeblockContextClient().getMarker('user-1')).resolves.toEqual({
      revision: '9007199254740993',
      databaseNow: '2026-07-24T10:00:00.000Z',
      timezone: 'Asia/Tokyo',
    });
    expect(rpc).toHaveBeenCalledWith('get_timeblock_context_marker_v1', {
      p_user_id: 'user-1',
    });
  });

  it('owner・active・overlap・決定順・page上限をnarrow occupancy queryへ固定する', async () => {
    const query = createChainableMock([
      {
        id: 'plan-1',
        start_at: '2026-07-24T10:00:00.000Z',
        end_at: '2026-07-24T11:00:00.000Z',
      },
    ]);
    from.mockReturnValue(query);
    const signal = new AbortController().signal;

    await expect(
      new TimeblockContextClient().listOccupancyPage(
        {
          userId: 'user-1',
          lane: 'plans',
          startDate: '2026-07-20T00:00:00+09:00',
          endDate: '2026-07-27T00:00:00+09:00',
          offset: 1_000,
          limit: 1_000,
        },
        signal,
      ),
    ).resolves.toEqual([
      {
        id: 'plan-1',
        startAt: '2026-07-24T10:00:00.000Z',
        endAt: '2026-07-24T11:00:00.000Z',
      },
    ]);

    expect(from).toHaveBeenCalledWith('plans');
    expect(query.select).toHaveBeenCalledWith('id,start_at,end_at');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.lt).toHaveBeenCalledWith('start_at', '2026-07-27T00:00:00+09:00');
    expect(query.gt).toHaveBeenCalledWith('end_at', '2026-07-20T00:00:00+09:00');
    expect(query.order).toHaveBeenNthCalledWith(1, 'start_at', { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(2, 'end_at', { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(3, 'id', { ascending: true });
    expect(query.range).toHaveBeenCalledWith(1_000, 1_999);
    expect(query.abortSignal).toHaveBeenCalledWith(signal);
  });

  it('Record laneでもraw DB detailをstable service errorへ変換する', async () => {
    const query = createChainableMock(null, {
      code: 'XX000',
      message: 'private record detail',
    });
    from.mockReturnValue(query);

    const error = await new TimeblockContextClient()
      .listOccupancyPage({
        userId: 'user-1',
        lane: 'records',
        startDate: '2026-07-20T00:00:00+09:00',
        endDate: '2026-07-27T00:00:00+09:00',
        offset: 0,
        limit: 1_000,
      })
      .catch((caught) => caught);

    expect(from).toHaveBeenCalledWith('records');
    expect(error).toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to read timeblock occupancy',
    });
    expect(String(error)).not.toContain('private record detail');
  });

  it('DB detailをstable service errorへ変換する', async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'private marker detail' },
    });

    const error = await new TimeblockContextClient().getMarker('user-1').catch((caught) => caught);

    expect(error).toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to read timeblock context marker',
    });
    expect(String(error)).not.toContain('private marker detail');
  });
});
