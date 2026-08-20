import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `fenced-sync-writer.ts` のテスト。retry ループのエラーコード分類
 * （overview.md §2）と `begin_calendar_sync_run_v1`（RETURNS TABLE）の shape 変換に絞る。
 * 5 RPC の CAS ロジック本体（凍結資産）は対象外。
 */

const createClient = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const resolveGoogleCalendarAuthorityIdentity = vi.hoisted(() => vi.fn());

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));
vi.mock('../authority-config', () => ({ resolveGoogleCalendarAuthorityIdentity }));

import {
  beginCalendarSyncRun,
  clearCalendarSyncCursor,
  finishCalendarSyncRun,
  resolveProjectKey,
} from '../fenced-sync-writer';

const CAS = {
  connectionId: '00000000-0000-4000-8000-0000000000c1',
  userId: '00000000-0000-4000-8000-0000000000a1',
  projectKey: 'project-key',
  expectedGeneration: 3,
  expectedAuthorityFenceId: 'fence-1',
  expectedAuthorityEpoch: 7,
};

function mockRpc(impl: (name: string, args: unknown) => { data: unknown; error: unknown }) {
  const rpc = vi.fn((name: string, args?: unknown) => ({
    abortSignal: () => Promise.resolve(impl(name, args)),
  }));
  createClient.mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveProjectKey', () => {
  it('authority config が解決できれば projectKey を返す', () => {
    resolveGoogleCalendarAuthorityIdentity.mockReturnValue({
      projectKey: 'p-1',
      oauthClientId: 'c',
    });
    expect(resolveProjectKey()).toBe('p-1');
  });

  it('authority config が未解決なら null を返す', () => {
    resolveGoogleCalendarAuthorityIdentity.mockReturnValue(null);
    expect(resolveProjectKey()).toBeNull();
  });
});

describe('エラーコード分類（overview.md §2）', () => {
  it('CA019（account deletion in progress）は Sentry capture せず account_deleting を返す', async () => {
    mockRpc(() => ({ data: null, error: { code: 'CA019' } }));

    const result = await clearCalendarSyncCursor({
      ...CAS,
      expectedSyncSequence: 1,
      calendarSelectionId: 'cal-1',
      providerCalendarId: 'primary',
      expectedSyncToken: 'token',
    });

    expect(result).toBe('account_deleting');
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('22023（invalid input）は Sentry capture して rejected_input を返す（retry しない）', async () => {
    const rpc = mockRpc(() => ({ data: null, error: { code: '22023' } }));

    const result = await clearCalendarSyncCursor({
      ...CAS,
      expectedSyncSequence: 1,
      calendarSelectionId: 'cal-1',
      providerCalendarId: 'primary',
      expectedSyncToken: 'token',
    });

    expect(result).toBe('rejected_input');
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ errorCode: '22023' }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('54000（sequence exhausted）は Sentry capture して rejected_input を返す', async () => {
    mockRpc(() => ({ data: null, error: { code: '54000' } }));

    const result = await finishCalendarSyncRun({
      ...CAS,
      expectedSyncSequence: 1,
      runStartedAt: '2026-08-20T00:00:00.000Z',
      lastSyncError: null,
    });

    expect(result).toBe('rejected_input');
    expect(captureUnexpectedError).toHaveBeenCalled();
  });

  it('40P01（deadlock）は応答喪失と同じ扱いで retry し、最終的に成功すれば discriminant を返す', async () => {
    let attempt = 0;
    const rpc = mockRpc(() => {
      attempt += 1;
      if (attempt < 3) return { data: null, error: { code: '40P01' } };
      return { data: 'finished', error: null };
    });

    const result = await finishCalendarSyncRun({
      ...CAS,
      expectedSyncSequence: 1,
      runStartedAt: '2026-08-20T00:00:00.000Z',
      lastSyncError: null,
    });

    expect(result).toBe('finished');
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it('retry を使い切ってもダメなら unresolved を返し Sentry capture する', async () => {
    mockRpc(() => ({ data: null, error: { code: '40P01' } }));

    const result = await finishCalendarSyncRun({
      ...CAS,
      expectedSyncSequence: 1,
      runStartedAt: '2026-08-20T00:00:00.000Z',
      lastSyncError: null,
    });

    expect(result).toBe('unresolved');
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'finish_calendar_sync_run' }),
    );
  });
});

describe('beginCalendarSyncRun（RETURNS TABLE の shape 変換）', () => {
  it('started の行を camelCase の CAS state へ変換する', async () => {
    mockRpc(() => ({
      data: [
        {
          result: 'started',
          data_generation: 3,
          authority_fence_id: 'fence-1',
          authority_epoch: 7,
          sync_sequence: 42,
          run_started_at: '2026-08-20T00:00:00.000Z',
          refresh_token_enc: 'enc',
        },
      ],
      error: null,
    }));

    const result = await beginCalendarSyncRun({
      connectionId: CAS.connectionId,
      userId: CAS.userId,
      projectKey: CAS.projectKey,
    });

    expect(result).toEqual({
      result: 'started',
      dataGeneration: 3,
      authorityFenceId: 'fence-1',
      authorityEpoch: 7,
      syncSequence: 42,
      runStartedAt: '2026-08-20T00:00:00.000Z',
      refreshTokenEnc: 'enc',
    });
  });

  it.each(['missing', 'reauth_required', 'superseded'])(
    '%s の行は result だけを返す',
    async (value) => {
      mockRpc(() => ({ data: [{ result: value }], error: null }));

      const result = await beginCalendarSyncRun({
        connectionId: CAS.connectionId,
        userId: CAS.userId,
        projectKey: CAS.projectKey,
      });

      expect(result).toEqual({ result: value });
    },
  );

  it('空の行集合は fail closed で unresolved を返す', async () => {
    mockRpc(() => ({ data: [], error: null }));

    const result = await beginCalendarSyncRun({
      connectionId: CAS.connectionId,
      userId: CAS.userId,
      projectKey: CAS.projectKey,
    });

    expect(result).toBe('unresolved');
  });
});

// pr-cross-review P2（PR #2276）: 残予算が RPC_TIMEOUT_MS 未満なら試行せず即座に
// 'deadline_exceeded' を返す。DB 劣化時に固定 timeout×attempts を残予算に関係なく
// 消費し、cron の後続接続を starve させないためのガード。
describe('deadline budget（pr-cross-review P2、PR #2276）', () => {
  it('begin: 残予算が RPC_TIMEOUT_MS 未満なら RPC を呼ばず deadline_exceeded を返す', async () => {
    const rpc = mockRpc(() => ({ data: null, error: { code: '40P01' } }));

    const result = await beginCalendarSyncRun({
      connectionId: CAS.connectionId,
      userId: CAS.userId,
      projectKey: CAS.projectKey,
      deadlineAt: Date.now() + 1_000,
    });

    expect(result).toBe('deadline_exceeded');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('clearCalendarSyncCursor: 残予算不足なら RPC を呼ばず deadline_exceeded を返す', async () => {
    const rpc = mockRpc(() => ({ data: 'cleared', error: null }));

    const result = await clearCalendarSyncCursor({
      ...CAS,
      expectedSyncSequence: 1,
      calendarSelectionId: 'cal-1',
      providerCalendarId: 'primary',
      expectedSyncToken: 'token',
      deadlineAt: Date.now() + 1_000,
    });

    expect(result).toBe('deadline_exceeded');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('deadlineAt 未指定なら常に試行する（既存呼び出し互換）', async () => {
    const rpc = mockRpc(() => ({ data: 'finished', error: null }));

    const result = await finishCalendarSyncRun({
      ...CAS,
      expectedSyncSequence: 1,
      runStartedAt: '2026-08-20T00:00:00.000Z',
      lastSyncError: null,
    });

    expect(result).toBe('finished');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('残予算が十分なら retry を継続する（budget check は attempt 前のみ）', async () => {
    let attempt = 0;
    const rpc = mockRpc(() => {
      attempt += 1;
      if (attempt < 2) return { data: null, error: { code: '40P01' } };
      return { data: 'finished', error: null };
    });

    const result = await finishCalendarSyncRun({
      ...CAS,
      expectedSyncSequence: 1,
      runStartedAt: '2026-08-20T00:00:00.000Z',
      lastSyncError: null,
      deadlineAt: Date.now() + 60_000,
    });

    expect(result).toBe('finished');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
