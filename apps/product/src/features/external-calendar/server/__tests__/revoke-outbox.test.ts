import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const createServiceRoleClient = vi.hoisted(() => vi.fn(() => ({ rpc })));
const revoke = vi.hoisted(() => vi.fn());
const decryptToken = vi.hoisted(() => vi.fn());
const isValidEncryptionKey = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/oauth', () => ({ createServiceRoleClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));
vi.mock('../providers/google', () => ({ googleCalendarAdapter: { revoke } }));
vi.mock('../token-crypto', () => ({ decryptToken, isValidEncryptionKey }));

import { MIN_BATCH_BUDGET_MS, processCalendarRevokeOutbox } from '../revoke-outbox';

const VALID_KEY = 'valid-test-key';
const CIPHERTEXT = 'v1.secret-ciphertext';
const PLAINTEXT = 'provider-refresh-token';
const FAR_DEADLINE = 10 ** 15;

const CLAIM = {
  outbox_id: '00000000-0000-4000-8000-000000000001',
  lease_id: '10000000-0000-4000-8000-000000000001',
  provider: 'google',
  refresh_token_enc: CIPHERTEXT,
  expires_at: '2026-07-27T00:00:00.000Z',
  attempt_count: 1,
};

type RpcResult = { data: unknown; error: unknown };

function setupRpc(overrides?: {
  expired?: number;
  claims?: (typeof CLAIM)[];
  complete?: boolean;
  retry?: string;
}): void {
  rpc.mockImplementation((operation: string) => {
    let result: RpcResult;
    switch (operation) {
      case 'expire_calendar_revoke_outbox_v1':
        result = { data: overrides?.expired ?? 0, error: null };
        break;
      case 'claim_calendar_revoke_outbox_v1':
        result = { data: overrides?.claims ?? [], error: null };
        break;
      case 'complete_calendar_revoke_outbox_v1':
        result = { data: overrides?.complete ?? true, error: null };
        break;
      case 'retry_calendar_revoke_outbox_v1':
        result = { data: overrides?.retry ?? 'retried', error: null };
        break;
      default:
        throw new Error(`Unexpected RPC: ${operation}`);
    }

    return { abortSignal: vi.fn(async () => result) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isValidEncryptionKey.mockReturnValue(true);
  decryptToken.mockReturnValue(PLAINTEXT);
  revoke.mockResolvedValue(true);
  setupRpc();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processCalendarRevokeOutbox', () => {
  // cron の時間予算はこの値を含む 3 module の不等式で成立している。
  // `maintenance-dispatcher.test.ts` は値を写して不等式を検査しているので、
  // ここで実値を pin して片側だけ動いた時に必ず落ちるようにする。
  it('MIN_BATCH_BUDGET_MS を pin する', () => {
    expect(MIN_BATCH_BUDGET_MS).toBe(23_000);
  });

  it('hard expiryを先に実行し、復号・provider revoke・lease付きcompleteを行う', async () => {
    setupRpc({ expired: 2, claims: [CLAIM], complete: true });

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: FAR_DEADLINE,
    });

    expect(rpc.mock.calls.map(([operation]) => operation)).toEqual([
      'expire_calendar_revoke_outbox_v1',
      'claim_calendar_revoke_outbox_v1',
      'complete_calendar_revoke_outbox_v1',
    ]);
    expect(decryptToken).toHaveBeenCalledWith(CIPHERTEXT, VALID_KEY);
    expect(revoke).toHaveBeenCalledWith(PLAINTEXT);
    expect(rpc).toHaveBeenCalledWith('complete_calendar_revoke_outbox_v1', {
      p_outbox_id: CLAIM.outbox_id,
      p_lease_id: CLAIM.lease_id,
    });
    expect(summary).toMatchObject({
      claimed: 1,
      revoked: 1,
      retried: 0,
      expired: 2,
      alreadyGone: 0,
      encryptionAvailable: true,
    });
  });

  it('providerが失効を確定できなければleaseをretryへ戻す', async () => {
    setupRpc({ claims: [CLAIM], retry: 'retried' });
    revoke.mockResolvedValue(false);

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: FAR_DEADLINE,
    });

    expect(rpc).toHaveBeenCalledWith('retry_calendar_revoke_outbox_v1', {
      p_outbox_id: CLAIM.outbox_id,
      p_lease_id: CLAIM.lease_id,
    });
    expect(summary).toMatchObject({ claimed: 1, revoked: 0, retried: 1 });
    expect(captureUnexpectedError).not.toHaveBeenCalled();
  });

  it('provider失効後のcomplete=falseはhard expiry済みの安全な既処理として扱う', async () => {
    setupRpc({ claims: [CLAIM], complete: false });

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: FAR_DEADLINE,
    });

    expect(summary).toMatchObject({ revoked: 0, alreadyGone: 1, retried: 0 });
  });

  it.each([
    ['expired', { expired: 1, alreadyGone: 0 }],
    ['missing', { expired: 1, alreadyGone: 0 }],
  ])('retry結果 %s を再投入せず正しく集計する', async (retry, expected) => {
    setupRpc({ claims: [CLAIM], retry });
    revoke.mockResolvedValue(false);

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: FAR_DEADLINE,
    });

    expect(summary).toMatchObject(expected);
  });

  it('復号失敗は安全化済み通知を1回だけ送り、暗号文を出さずretryする', async () => {
    const secondClaim = {
      ...CLAIM,
      outbox_id: '00000000-0000-4000-8000-000000000002',
      lease_id: '10000000-0000-4000-8000-000000000002',
    };
    setupRpc({ claims: [CLAIM, secondClaim], retry: 'retried' });
    decryptToken.mockImplementation(() => {
      throw new Error(`decrypt failed for ${CIPHERTEXT}`);
    });

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: FAR_DEADLINE,
    });

    expect(summary.retried).toBe(2);
    expect(revoke).not.toHaveBeenCalled();
    expect(captureUnexpectedError).toHaveBeenCalledTimes(1);

    const reported = JSON.stringify(captureUnexpectedError.mock.calls);
    expect(reported).not.toContain(CIPHERTEXT);
    expect(reported).not.toContain(PLAINTEXT);
    expect(reported).not.toContain(CLAIM.outbox_id);
    expect(reported).not.toContain(CLAIM.lease_id);
  });

  it('暗号鍵が無効でもhard expiryを実行し、claimは行わない', async () => {
    isValidEncryptionKey.mockReturnValue(false);
    setupRpc({ expired: 3, claims: [CLAIM] });

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: undefined,
      deadlineAt: FAR_DEADLINE,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('expire_calendar_revoke_outbox_v1', {
      p_limit: 250,
    });
    expect(summary).toMatchObject({
      expired: 3,
      claimed: 0,
      encryptionAvailable: false,
    });
  });

  it('provider処理の余白がない時はclaimせずdeadlineReachedを返す', async () => {
    setupRpc({ claims: [CLAIM] });

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: Date.now() + 16_000,
    });

    expect(rpc.mock.calls.map(([operation]) => operation)).toEqual([
      'expire_calendar_revoke_outbox_v1',
    ]);
    expect(summary).toMatchObject({ claimed: 0, deadlineReached: true });
  });

  it('claim中に余白を失ったらproviderを呼ばず全leaseをretryへ戻す', async () => {
    const secondClaim = {
      ...CLAIM,
      outbox_id: '00000000-0000-4000-8000-000000000002',
      lease_id: '10000000-0000-4000-8000-000000000002',
    };
    const baseNow = 1_800_000_000_000;
    let currentNow = baseNow;
    vi.spyOn(Date, 'now').mockImplementation(() => currentNow);
    rpc.mockImplementation((operation: string) => {
      let result: RpcResult;
      if (operation === 'expire_calendar_revoke_outbox_v1') {
        result = { data: 0, error: null };
      } else if (operation === 'claim_calendar_revoke_outbox_v1') {
        result = { data: [CLAIM, secondClaim], error: null };
      } else if (operation === 'retry_calendar_revoke_outbox_v1') {
        result = { data: 'retried', error: null };
      } else {
        throw new Error(`Unexpected RPC: ${operation}`);
      }

      return {
        abortSignal: vi.fn(async () => {
          if (operation === 'claim_calendar_revoke_outbox_v1') currentNow += 5_000;
          return result;
        }),
      };
    });

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: baseNow + 23_000,
    });

    expect(revoke).not.toHaveBeenCalled();
    expect(
      rpc.mock.calls.filter(([operation]) => operation === 'retry_calendar_revoke_outbox_v1'),
    ).toHaveLength(2);
    expect(summary).toMatchObject({
      claimed: 2,
      retried: 2,
      deadlineReached: true,
    });
  });

  it('同batchの1件がsettlement失敗しても全leaseの処理完了を待ってからrejectする', async () => {
    const secondClaim = {
      ...CLAIM,
      outbox_id: '00000000-0000-4000-8000-000000000002',
      lease_id: '10000000-0000-4000-8000-000000000002',
    };
    let secondSettled = false;
    rpc.mockImplementation((operation: string, args?: { p_outbox_id?: string }) => {
      return {
        abortSignal: vi.fn(async () => {
          if (operation === 'expire_calendar_revoke_outbox_v1') {
            return { data: 0, error: null };
          }
          if (operation === 'claim_calendar_revoke_outbox_v1') {
            return { data: [CLAIM, secondClaim], error: null };
          }
          if (operation === 'complete_calendar_revoke_outbox_v1') {
            if (args?.p_outbox_id === CLAIM.outbox_id) {
              return { data: null, error: { message: CIPHERTEXT } };
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
            secondSettled = true;
            return { data: true, error: null };
          }
          throw new Error(`Unexpected RPC: ${operation}`);
        }),
      };
    });

    await expect(
      processCalendarRevokeOutbox({
        encryptionKey: VALID_KEY,
        deadlineAt: FAR_DEADLINE,
      }),
    ).rejects.toMatchObject({
      name: 'CalendarRevokeMaintenanceError',
      message: 'Calendar revoke maintenance failed',
    });
    expect(secondSettled).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('1 runは5件ずつ最大20件までclaimする', async () => {
    let nextIndex = 0;
    rpc.mockImplementation((operation: string, args?: { p_limit?: number }) => {
      return {
        abortSignal: vi.fn(async () => {
          if (operation === 'expire_calendar_revoke_outbox_v1') {
            return { data: 0, error: null };
          }
          if (operation === 'claim_calendar_revoke_outbox_v1') {
            const claims = Array.from({ length: args?.p_limit ?? 0 }, () => {
              nextIndex += 1;
              return {
                ...CLAIM,
                outbox_id: `00000000-0000-4000-8000-${nextIndex.toString().padStart(12, '0')}`,
                lease_id: `10000000-0000-4000-8000-${nextIndex.toString().padStart(12, '0')}`,
              };
            });
            return { data: claims, error: null };
          }
          if (operation === 'complete_calendar_revoke_outbox_v1') {
            return { data: true, error: null };
          }
          throw new Error(`Unexpected RPC: ${operation}`);
        }),
      };
    });

    const summary = await processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: FAR_DEADLINE,
    });

    const claims = rpc.mock.calls.filter(
      ([operation]) => operation === 'claim_calendar_revoke_outbox_v1',
    );
    expect(claims).toHaveLength(4);
    expect(claims.every(([, args]) => args.p_limit === 5)).toBe(true);
    expect(summary).toMatchObject({ claimed: 20, revoked: 20 });
    expect(revoke).toHaveBeenCalledTimes(20);
  });

  it('DB失敗の例外にRPC errorやpayloadを含めない', async () => {
    rpc.mockReturnValueOnce({
      abortSignal: vi.fn(async () => ({
        data: null,
        error: { message: CIPHERTEXT },
      })),
    });

    const operation = processCalendarRevokeOutbox({
      encryptionKey: VALID_KEY,
      deadlineAt: FAR_DEADLINE,
    });

    await expect(operation).rejects.toMatchObject({
      name: 'CalendarRevokeMaintenanceError',
      message: 'Calendar revoke maintenance failed',
    });
    await expect(operation).rejects.not.toThrow(CIPHERTEXT);
  });
});
