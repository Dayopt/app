import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { RecoveryService } from '../recovery-service';

const listFactors = vi.hoisted(() => vi.fn());
const deleteFactor = vi.hoisted(() => vi.fn());
const verifyRecoveryCode = vi.hoisted(() => vi.fn());
const adminRpc = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/recovery-codes', () => ({ verifyRecoveryCode }));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError,
  observeAuthOperation: async (_operation: string, call: () => PromiseLike<unknown>) => call(),
}));

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { mfa: { listFactors, deleteFactor } } },
    rpc: adminRpc,
  }),
}));

const USER_ID = '00000000-0000-4000-8000-000000000001';
const CODE = 'ABCD-EFGH';

function createService(options?: {
  codes?: unknown[] | null;
  fetchError?: { message: string; code?: string } | null;
  rpcResults?: Array<{ data: unknown; error: { message: string } | null }>;
  adminRpcResult?: { data: unknown; error: { message: string } | null };
}) {
  const query = createChainableMock(options?.codes ?? [], options?.fetchError ?? null);
  const rpcResults = [...(options?.rpcResults ?? [])];
  const rpc = vi.fn(async () => rpcResults.shift() ?? { data: null, error: null });
  adminRpc.mockResolvedValue(options?.adminRpcResult ?? { data: true, error: null });
  const from = vi.fn(() => query);

  return {
    service: new RecoveryService({ from, rpc } as never),
    query,
    rpc,
  };
}

describe('RecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRecoveryCode.mockImplementation(
      (_code: string, hash: string) => hash === 'matching-hash',
    );
    listFactors.mockResolvedValue({ data: { factors: [] }, error: null });
    deleteFactor.mockResolvedValue({ data: {}, error: null });
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  it('一致したコードを消費し、verified factorだけを削除して残数を返す', async () => {
    const hash = 'matching-hash';
    const { service, query, rpc } = createService({
      codes: [{ id: 'code-1', code_hash: hash }],
      rpcResults: [{ data: 7, error: null }],
    });
    listFactors.mockResolvedValue({
      data: {
        factors: [
          { id: 'verified-1', status: 'verified' },
          { id: 'unverified-1', status: 'unverified' },
        ],
      },
      error: null,
    });

    await expect(service.verify({ userId: USER_ID, code: CODE })).resolves.toEqual({
      success: true,
      remainingCodes: 7,
    });
    expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(query.is).toHaveBeenCalledWith('used_at', null);
    expect(adminRpc).toHaveBeenCalledWith('use_recovery_code', {
      p_user_id: USER_ID,
      p_code_hash: hash,
    });
    expect(rpc).toHaveBeenCalledWith('count_unused_recovery_codes', { p_user_id: USER_ID });
    expect(deleteFactor).toHaveBeenCalledWith({ userId: USER_ID, id: 'verified-1' });
    expect(deleteFactor).not.toHaveBeenCalledWith({ userId: USER_ID, id: 'unverified-1' });
  });

  it('未使用コードがなければ RECOVERY_EXHAUSTED を投げる', async () => {
    const { service } = createService({ codes: [] });

    await expect(service.verify({ userId: USER_ID, code: CODE })).rejects.toMatchObject({
      code: 'RECOVERY_EXHAUSTED',
      message: 'RECOVERY_EXHAUSTED',
    });
  });

  it('コードが一致しなければ RECOVERY_INVALID を投げる', async () => {
    const { service } = createService({
      codes: [{ id: 'code-1', code_hash: 'other-hash' }],
    });

    await expect(service.verify({ userId: USER_ID, code: CODE })).rejects.toMatchObject({
      code: 'RECOVERY_INVALID',
      message: 'RECOVERY_INVALID',
    });
  });

  it('コード取得エラーを RECOVERY_FAILED にする', async () => {
    const fetchError = { message: 'fetch failed', code: 'PGRST000' };
    const { service } = createService({
      fetchError,
    });

    await expect(service.verify({ userId: USER_ID, code: CODE })).rejects.toMatchObject({
      code: 'RECOVERY_FAILED',
      message: 'Failed to fetch recovery codes',
      cause: expect.objectContaining({ cause: fetchError }),
    });
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(fetchError, {
      feature: 'mfa_recovery',
      operation: 'fetch_recovery_codes',
    });
  });

  it('コード消費に失敗した場合はfactorを削除しない', async () => {
    const { service } = createService({
      codes: [{ id: 'code-1', code_hash: 'matching-hash' }],
      adminRpcResult: { data: false, error: null },
    });

    await expect(service.verify({ userId: USER_ID, code: CODE })).rejects.toMatchObject({
      code: 'RECOVERY_FAILED',
      message: 'Failed to use recovery code',
    });
    expect(listFactors).not.toHaveBeenCalled();
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
  });

  it('残数取得の失敗は非致命的として0を返す', async () => {
    const countError = { message: 'count failed' };
    const { service } = createService({
      codes: [{ id: 'code-1', code_hash: 'matching-hash' }],
      rpcResults: [{ data: null, error: countError }],
    });

    await expect(service.verify({ userId: USER_ID, code: CODE })).resolves.toEqual({
      success: true,
      remainingCodes: 0,
    });
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(countError, {
      feature: 'mfa_recovery',
      operation: 'count_remaining_recovery_codes',
    });
  });
});
