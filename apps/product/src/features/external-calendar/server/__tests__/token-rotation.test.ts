import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn());
const encryptToken = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('../token-crypto', () => ({ encryptToken }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import { markCalendarConnectionReauth, persistCalendarTokenRotation } from '../token-rotation';

const revoke = vi.fn();
const baseInput = {
  operationId: '00000000-0000-4000-8000-0000000000a1',
  userId: '00000000-0000-4000-8000-0000000000b1',
  connectionId: '00000000-0000-4000-8000-0000000000c1',
  expectedGeneration: 3,
  expectedRefreshTokenEnc: 'encrypted-old',
  rotatedRefreshToken: 'rotated-plain',
  encryptionKey: 'encryption-key',
  provider: { revoke },
  lastSyncedAt: '2026-07-26T00:00:00.000Z',
};

type RpcResult = { data: string | null; error: { code?: string } | null };
type RpcResponse = RpcResult | Error;
type RpcName =
  | 'mark_calendar_connection_reauth_command_v2'
  | 'prepare_calendar_token_rotation_recovery_command_v1'
  | 'rotate_or_enqueue_calendar_refresh_token_command_v2';

function setupRpc(results: Partial<Record<RpcName, RpcResponse[]>>) {
  const counters: Record<RpcName, number> = {
    mark_calendar_connection_reauth_command_v2: 0,
    prepare_calendar_token_rotation_recovery_command_v1: 0,
    rotate_or_enqueue_calendar_refresh_token_command_v2: 0,
  };
  const rpc = vi.fn((name: RpcName, _args: unknown) => {
    const responses = results[name] ?? [];
    const index = counters[name];
    counters[name] += 1;
    const response = responses[Math.min(index, responses.length - 1)];

    return {
      abortSignal: vi.fn(() => {
        if (response === undefined) return Promise.reject(new Error('unexpected RPC call'));
        return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
      }),
    };
  });
  createClient.mockReturnValue({ rpc });
  return { rpc };
}

function rpcCalls(rpc: ReturnType<typeof setupRpc>['rpc'], name: RpcName) {
  return rpc.mock.calls.filter(([calledName]) => calledName === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  encryptToken.mockReturnValue('encrypted-new');
  revoke.mockResolvedValue(true);
});

describe('persistCalendarTokenRotation', () => {
  it('updatedでは同一operation authorityだけをmarkできるopaqueな証明を返す', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [{ data: 'updated', error: null }],
      mark_calendar_connection_reauth_command_v2: [{ data: 'marked', error: null }],
    });

    const result = await persistCalendarTokenRotation(baseInput);

    expect(result).toEqual({
      outcome: 'updated',
      markReauthIfCurrent: expect.any(Function),
    });
    expect(rpc).toHaveBeenCalledWith('rotate_or_enqueue_calendar_refresh_token_command_v2', {
      p_operation_id: baseInput.operationId,
      p_user_id: baseInput.userId,
      p_connection_id: baseInput.connectionId,
      p_expected_generation: baseInput.expectedGeneration,
      p_expected_refresh_token_enc: baseInput.expectedRefreshTokenEnc,
      p_new_refresh_token_enc: 'encrypted-new',
    });
    expect(revoke).not.toHaveBeenCalled();

    if (result.markReauthIfCurrent === null) throw new Error('expected reauth proof');
    await expect(result.markReauthIfCurrent()).resolves.toBe('marked');
    expect(rpc).toHaveBeenCalledWith('mark_calendar_connection_reauth_command_v2', {
      p_user_id: baseInput.userId,
      p_connection_id: baseInput.connectionId,
      p_expected_generation: baseInput.expectedGeneration,
      p_expected_refresh_token_enc: baseInput.expectedRefreshTokenEnc,
      p_operation_id: baseInput.operationId,
      p_new_refresh_token_enc: 'encrypted-new',
      p_last_synced_at: baseInput.lastSyncedAt,
    });
  });

  it('enqueuedでは後続mark証明を返さない', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [{ data: 'enqueued', error: null }],
      mark_calendar_connection_reauth_command_v2: [],
    });

    await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
      outcome: 'enqueued',
      markReauthIfCurrent: null,
    });
    expect(rpc).toHaveBeenCalledWith('rotate_or_enqueue_calendar_refresh_token_command_v2', {
      p_operation_id: baseInput.operationId,
      p_user_id: baseInput.userId,
      p_connection_id: baseInput.connectionId,
      p_expected_generation: baseInput.expectedGeneration,
      p_expected_refresh_token_enc: baseInput.expectedRefreshTokenEnc,
      p_new_refresh_token_enc: 'encrypted-new',
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('response欠落後も同じoperation IDと暗号文で再試行する', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [
        new Error('socket closed after commit'),
        { data: 'updated', error: null },
      ],
      mark_calendar_connection_reauth_command_v2: [],
    });

    const result = await persistCalendarTokenRotation(baseInput);
    expect(result.outcome).toBe('updated');
    const rotationCalls = rpcCalls(rpc, 'rotate_or_enqueue_calendar_refresh_token_command_v2');
    expect(rotationCalls).toHaveLength(2);
    expect(encryptToken).toHaveBeenCalledTimes(1);
    expect(rotationCalls[0]).toEqual(rotationCalls[1]);
  });

  it('未確定SQLSTATE responseも同じpayloadで再試行する', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [
        { data: null, error: { code: '08006' } },
        { data: 'updated', error: null },
      ],
      mark_calendar_connection_reauth_command_v2: [],
    });

    const result = await persistCalendarTokenRotation(baseInput);
    expect(result.outcome).toBe('updated');
    const rotationCalls = rpcCalls(rpc, 'rotate_or_enqueue_calendar_refresh_token_command_v2');
    expect(rotationCalls).toHaveLength(2);
    expect(rotationCalls[0]).toEqual(rotationCalls[1]);
  });

  it('確定rollbackではprovider失効前にDBへtokenを退避して現authorityを停止する', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [
        { data: null, error: { code: 'CA002' } },
      ],
      prepare_calendar_token_rotation_recovery_command_v1: [{ data: 'marked', error: null }],
    });

    await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
      outcome: 'reauth_required',
      markReauthIfCurrent: null,
    });
    expect(rpc).toHaveBeenCalledWith('prepare_calendar_token_rotation_recovery_command_v1', {
      p_operation_id: baseInput.operationId,
      p_user_id: baseInput.userId,
      p_connection_id: baseInput.connectionId,
      p_expected_generation: baseInput.expectedGeneration,
      p_expected_refresh_token_enc: baseInput.expectedRefreshTokenEnc,
      p_new_refresh_token_enc: 'encrypted-new',
      p_last_synced_at: baseInput.lastSyncedAt,
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(rpcCalls(rpc, 'mark_calendar_connection_reauth_command_v2')).toHaveLength(0);
  });

  it('rotation結果が不明でもDB recoveryを確定し、provider失効はworkerへ委ねる', async () => {
    setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [
        new Error('secret-one'),
        new Error('secret-two'),
        new Error('secret-three'),
      ],
      prepare_calendar_token_rotation_recovery_command_v1: [{ data: 'marked', error: null }],
    });

    await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
      outcome: 'reauth_required',
      markReauthIfCurrent: null,
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'calendar token rotation outcome is unresolved' }),
      expect.any(Object),
    );
  });

  it('DB clientを構築できなくてもthrowせずunresolvedにする', async () => {
    createClient.mockImplementation(() => {
      throw new Error('service-role-secret-detail');
    });

    await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
      outcome: 'unresolved',
      markReauthIfCurrent: null,
    });
    expect(createClient).toHaveBeenCalledTimes(6);
    expect(revoke).not.toHaveBeenCalled();
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'calendar token rotation recovery is unresolved',
      }),
      expect.any(Object),
    );
  });

  it('暗号化失敗ではDBでauthorityを停止できた後だけproviderを直接失効する', async () => {
    encryptToken.mockImplementation(() => {
      throw new Error('secret-key-detail');
    });
    const { rpc } = setupRpc({
      prepare_calendar_token_rotation_recovery_command_v1: [{ data: 'marked', error: null }],
    });

    await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
      outcome: 'reauth_required',
      markReauthIfCurrent: null,
    });
    expect(rpcCalls(rpc, 'rotate_or_enqueue_calendar_refresh_token_command_v2')).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith('prepare_calendar_token_rotation_recovery_command_v1', {
      p_operation_id: baseInput.operationId,
      p_user_id: baseInput.userId,
      p_connection_id: baseInput.connectionId,
      p_expected_generation: baseInput.expectedGeneration,
      p_expected_refresh_token_enc: baseInput.expectedRefreshTokenEnc,
      p_last_synced_at: baseInput.lastSyncedAt,
    });
    expect(revoke).toHaveBeenCalledWith(baseInput.rotatedRefreshToken);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(revoke.mock.invocationCallOrder[0]!);
  });

  it('purge後のrecoveryはmissingを返し、暗号化済みtokenを直接失効しない', async () => {
    setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [
        { data: null, error: { code: 'CA002' } },
      ],
      prepare_calendar_token_rotation_recovery_command_v1: [{ data: 'missing', error: null }],
    });

    await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
      outcome: 'missing',
      markReauthIfCurrent: null,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('recovery response欠落後も余計なkeyを加えず同じpayloadで再試行する', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [
        { data: null, error: { code: 'CA002' } },
      ],
      prepare_calendar_token_rotation_recovery_command_v1: [
        new Error('response lost'),
        { data: 'marked', error: null },
      ],
    });

    const result = await persistCalendarTokenRotation(baseInput);
    expect(result.outcome).toBe('reauth_required');
    const recoveryCalls = rpcCalls(rpc, 'prepare_calendar_token_rotation_recovery_command_v1');
    expect(recoveryCalls).toHaveLength(2);
    expect(recoveryCalls[0]).toEqual(recoveryCalls[1]);
    expect(recoveryCalls[0]?.[1]).not.toHaveProperty('lastSyncedAt');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('recoveryを確定できなければproviderを失効せずunresolvedにする', async () => {
    setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [
        { data: null, error: { code: 'CA002' } },
      ],
      prepare_calendar_token_rotation_recovery_command_v1: [
        new Error('one'),
        new Error('two'),
        new Error('three'),
      ],
    });

    await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
      outcome: 'unresolved',
      markReauthIfCurrent: null,
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it.each([false, new Error('provider-secret')])(
    '暗号化不能tokenのprovider失効未確認でもraw errorを保持しない',
    async (result) => {
      encryptToken.mockImplementation(() => {
        throw new Error('secret-key-detail');
      });
      revoke.mockImplementation(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
      );
      setupRpc({
        prepare_calendar_token_rotation_recovery_command_v1: [{ data: 'marked', error: null }],
      });

      await expect(persistCalendarTokenRotation(baseInput)).resolves.toEqual({
        outcome: 'reauth_required',
        markReauthIfCurrent: null,
      });
      expect(captureUnexpectedError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'calendar token rotation compensation was not confirmed',
        }),
        expect.any(Object),
      );
    },
  );
});

describe('markCalendarConnectionReauth', () => {
  it('invalid grantで観測した旧authorityだけをmarkする', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [],
      mark_calendar_connection_reauth_command_v2: [{ data: 'marked', error: null }],
    });

    await expect(
      markCalendarConnectionReauth({
        userId: baseInput.userId,
        connectionId: baseInput.connectionId,
        expectedGeneration: baseInput.expectedGeneration,
        expectedRefreshTokenEnc: baseInput.expectedRefreshTokenEnc,
      }),
    ).resolves.toBe('marked');

    const args = rpcCalls(rpc, 'mark_calendar_connection_reauth_command_v2')[0]?.[1];
    expect(args).not.toHaveProperty('p_operation_id');
    expect(args).not.toHaveProperty('p_new_refresh_token_enc');
  });

  it('response欠落後も同じCAS値で再試行する', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [],
      mark_calendar_connection_reauth_command_v2: [
        new Error('response lost'),
        { data: 'missing', error: null },
      ],
    });
    const input = {
      userId: baseInput.userId,
      connectionId: baseInput.connectionId,
      expectedGeneration: baseInput.expectedGeneration,
      expectedRefreshTokenEnc: baseInput.expectedRefreshTokenEnc,
      lastSyncedAt: baseInput.lastSyncedAt,
    };

    await expect(markCalendarConnectionReauth(input)).resolves.toBe('missing');
    const calls = rpcCalls(rpc, 'mark_calendar_connection_reauth_command_v2');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
  });

  it('確定rollbackではraw errorを保持せずunresolvedにする', async () => {
    const { rpc } = setupRpc({
      rotate_or_enqueue_calendar_refresh_token_command_v2: [],
      mark_calendar_connection_reauth_command_v2: [{ data: null, error: { code: 'CA003' } }],
    });

    await expect(
      markCalendarConnectionReauth({
        userId: baseInput.userId,
        connectionId: baseInput.connectionId,
        expectedGeneration: baseInput.expectedGeneration,
        expectedRefreshTokenEnc: baseInput.expectedRefreshTokenEnc,
      }),
    ).resolves.toBe('unresolved');
    expect(rpcCalls(rpc, 'mark_calendar_connection_reauth_command_v2')).toHaveLength(1);
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'calendar connection reauthorization was rejected',
      }),
      expect.any(Object),
    );
  });
});
