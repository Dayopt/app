import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const single = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: (error: unknown) =>
    error instanceof Error ? error : new Error('database marker read failed'),
}));

import { TimeblockContextClient } from '../timeblock-context-client';

describe('TimeblockContextClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReturnValue({ single });
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
