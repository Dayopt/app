import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureUnexpectedError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

import {
  CalendarAccountDeletionError,
  createCalendarAccountDeletionAdapter,
  createCalendarAccountDeletionService,
} from './account-deletion';
import { encryptToken } from './token-crypto';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const REQUESTED_DELETION_ID = '00000000-0000-4000-8000-000000000002';
const CANONICAL_DELETION_ID = '00000000-0000-4000-8000-000000000003';
const REQUESTED_OPERATION_ID = '00000000-0000-4000-8000-000000000004';
const CANONICAL_OPERATION_ID = '00000000-0000-4000-8000-000000000005';
const ITEM_ID = '00000000-0000-4000-8000-000000000006';
const LEASE_ID = '00000000-0000-4000-8000-000000000007';
const SECOND_LEASE_ID = '00000000-0000-4000-8000-000000000008';
const EXPECTED_GENERATION = 7;
const NOW = Date.parse('2026-07-26T00:00:00.000Z');
const ATTEMPT_DEADLINE = '2026-07-26T00:02:00.000Z';
const NEAR_ATTEMPT_DEADLINE = '2026-07-26T00:00:10.000Z';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const REFRESH_TOKEN_ENC = encryptToken('refresh-token-secret', ENCRYPTION_KEY);

type MockRpcResponse = {
  data: unknown;
  error: unknown;
};

type MockRpcResult = MockRpcResponse | Error;

const READINESS = {
  activated: true,
  oauth_client_id: '123456-calendar.apps.googleusercontent.com',
  pending_operations: 0,
  project_epoch: 1,
  project_state: 'ready',
  unbound_connections: 0,
  unbound_outbox: 0,
};

function success(data: unknown): MockRpcResponse {
  return { data, error: null };
}

function createDb(responses: Record<string, MockRpcResult[]>) {
  const queues = new Map(Object.entries(responses).map(([name, values]) => [name, [...values]]));
  const rpc = vi.fn((name: string, _args?: unknown) => ({
    abortSignal: vi.fn(async () => {
      const next = queues.get(name)?.shift();
      if (next === undefined) throw new Error(`Unexpected RPC: ${name}`);
      if (next instanceof Error) throw next;
      return next;
    }),
  }));

  return { db: { rpc } as never, rpc };
}

function createService(
  responses: Record<string, MockRpcResult[]>,
  options?: {
    generatedIds?: string[];
    providerResult?: boolean | Error;
  },
) {
  const { db, rpc } = createDb({
    get_calendar_authority_readiness_v1: [success([READINESS])],
    ...responses,
  });
  const generatedIds = [
    REQUESTED_DELETION_ID,
    REQUESTED_OPERATION_ID,
    ...(options?.generatedIds ?? []),
  ];
  const generateId = vi.fn(() => generatedIds.shift() ?? crypto.randomUUID());
  const revoke = vi.fn(async () => {
    if (options?.providerResult instanceof Error) throw options.providerResult;
    return options?.providerResult ?? true;
  });

  const service = createCalendarAccountDeletionService({
    db,
    encryptionKey: ENCRYPTION_KEY,
    generateId,
    identity: {
      oauthClientId: READINESS.oauth_client_id,
      projectKey: '123456',
    },
    now: () => NOW,
    provider: { revoke },
  });

  return { generateId, revoke, rpc, service };
}

function beginWithConnection() {
  return success([
    {
      deletion_id: CANONICAL_DELETION_ID,
      item_kind: 'connection',
      item_id: ITEM_ID,
    },
  ]);
}

function prepared(leaseId = LEASE_ID, attemptDeadlineAt = ATTEMPT_DEADLINE) {
  return success([
    {
      operation_id: CANONICAL_OPERATION_ID,
      result: 'prepared',
      refresh_token_enc: REFRESH_TOKEN_ENC,
      lease_id: leaseId,
      lease_expires_at: ATTEMPT_DEADLINE,
      attempt_deadline_at: attemptDeadlineAt,
    },
  ]);
}

describe('Calendar account deletion service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('beginが返すcanonical deletion IDでready intentをsealする', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [
        success([
          {
            deletion_id: CANONICAL_DELETION_ID,
            item_kind: 'none',
            item_id: null,
          },
        ]),
      ],
      seal_calendar_account_deletion_v1: [success(true)],
    });

    await expect(service.beforeIdentityDeletion({ userId: USER_ID })).resolves.toBeUndefined();

    expect(revoke).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('begin_calendar_account_deletion_v1', {
      p_deletion_id: REQUESTED_DELETION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
    });
    expect(rpc).toHaveBeenCalledWith('seal_calendar_account_deletion_v1', {
      p_deletion_id: CANONICAL_DELETION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
    });
  });

  it('generic gateがbindしたCalendar deletion IDを変更せずに使う', async () => {
    const { generateId, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [
        success([
          {
            deletion_id: CANONICAL_DELETION_ID,
            item_kind: 'none',
            item_id: null,
          },
        ]),
      ],
      seal_calendar_account_deletion_v1: [success(true)],
    });

    await expect(
      service.beforeBoundIdentityDeletion({
        deletionId: CANONICAL_DELETION_ID,
        userId: USER_ID,
      }),
    ).resolves.toBeUndefined();

    expect(generateId).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('begin_calendar_account_deletion_v1', {
      p_deletion_id: CANONICAL_DELETION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
    });
    expect(rpc).toHaveBeenCalledWith('seal_calendar_account_deletion_v1', {
      p_deletion_id: CANONICAL_DELETION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
    });
  });

  it('generic gateがbindしたIDとDB canonical IDが違えばseal前で止める', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [
        success([
          {
            deletion_id: CANONICAL_DELETION_ID,
            item_kind: 'none',
            item_id: null,
          },
        ]),
      ],
    });

    await expect(
      service.beforeBoundIdentityDeletion({
        deletionId: REQUESTED_DELETION_ID,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: 'CALENDAR_ACCOUNT_DELETION_BOUND_IDENTITY_FAILED',
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('seal_calendar_account_deletion_v1', expect.anything());
  });

  it('DB start marker後だけproviderを1回呼びcanonical operationをfinalizeする', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [prepared()],
      start_calendar_account_delete_provider_attempt_v1: [success('started')],
      finalize_calendar_account_delete_revoke_v1: [success('revoke_guarded')],
      seal_calendar_account_deletion_v1: [success(true)],
    });

    await service.beforeIdentityDeletion({ userId: USER_ID });

    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('refresh-token-secret');
    expect(rpc).toHaveBeenCalledWith('prepare_calendar_account_delete_revoke_v1', {
      p_deletion_id: CANONICAL_DELETION_ID,
      p_operation_id: REQUESTED_OPERATION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
      p_item_kind: 'connection',
      p_item_id: ITEM_ID,
    });
    expect(rpc).toHaveBeenCalledWith('finalize_calendar_account_delete_revoke_v1', {
      p_deletion_id: CANONICAL_DELETION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
      p_operation_id: CANONICAL_OPERATION_ID,
      p_lease_id: LEASE_ID,
      p_outcome: 'confirmed',
    });
  });

  it('provider未確認結果をunconfirmed receiptとしてfinalizeする', async () => {
    const { rpc, service } = createService(
      {
        begin_calendar_account_deletion_v1: [beginWithConnection()],
        prepare_calendar_account_delete_revoke_v1: [prepared()],
        start_calendar_account_delete_provider_attempt_v1: [success('started')],
        finalize_calendar_account_delete_revoke_v1: [success('expiry_guarded')],
        seal_calendar_account_deletion_v1: [success(true)],
      },
      { providerResult: false },
    );

    await service.beforeIdentityDeletion({ userId: USER_ID });

    expect(rpc).toHaveBeenCalledWith(
      'finalize_calendar_account_delete_revoke_v1',
      expect.objectContaining({ p_outcome: 'unconfirmed' }),
    );
  });

  it('token復号失敗はproviderを呼ばずnot_attempted receiptへ固定する', async () => {
    const invalidPrepared = prepared();
    (invalidPrepared.data as Array<{ refresh_token_enc: string }>)[0]!.refresh_token_enc =
      'invalid-ciphertext';
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [invalidPrepared],
      abandon_calendar_account_delete_revoke_v1: [success('not_attempted')],
      seal_calendar_account_deletion_v1: [success(true)],
    });

    await service.beforeIdentityDeletion({ userId: USER_ID });

    expect(revoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith(
      'start_calendar_account_delete_provider_attempt_v1',
      expect.anything(),
    );
    expect(rpc).toHaveBeenCalledWith('abandon_calendar_account_delete_revoke_v1', {
      p_deletion_id: CANONICAL_DELETION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
      p_operation_id: CANONICAL_OPERATION_ID,
      p_lease_id: LEASE_ID,
      p_reason: 'decrypt_failed',
    });
    expect(captureUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Calendar account deletion token decryption failed',
      }),
      {
        feature: 'external_calendar',
        operation: 'prepare_account_deletion',
      },
    );
  });

  it('start response loss後のalready_startedではproviderを再実行しない', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [prepared()],
      start_calendar_account_delete_provider_attempt_v1: [
        new Error('response lost'),
        success('already_started'),
      ],
    });

    await expect(service.beforeIdentityDeletion({ userId: USER_ID })).rejects.toMatchObject({
      code: 'CALENDAR_ACCOUNT_DELETION_START_IN_FLIGHT_FAILED',
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(
      rpc.mock.calls.filter(
        ([name]) => name === 'start_calendar_account_delete_provider_attempt_v1',
      ),
    ).toHaveLength(2);
    expect(rpc).not.toHaveBeenCalledWith('seal_calendar_account_deletion_v1', expect.anything());
  });

  it('finalize response lossは同じoutcomeだけ再送しproviderは1回に保つ', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [prepared()],
      start_calendar_account_delete_provider_attempt_v1: [success('started')],
      finalize_calendar_account_delete_revoke_v1: [
        new Error('response lost'),
        success('revoke_guarded'),
      ],
      seal_calendar_account_deletion_v1: [success(true)],
    });

    await service.beforeIdentityDeletion({ userId: USER_ID });

    expect(revoke).toHaveBeenCalledOnce();
    const finalizeCalls = rpc.mock.calls.filter(
      ([name]) => name === 'finalize_calendar_account_delete_revoke_v1',
    );
    expect(finalizeCalls).toHaveLength(2);
    expect(finalizeCalls[0]?.[1]).toEqual(finalizeCalls[1]?.[1]);
  });

  it('finalizeが解決しない場合はproviderを再実行せずseal前で止める', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [prepared()],
      start_calendar_account_delete_provider_attempt_v1: [success('started')],
      finalize_calendar_account_delete_revoke_v1: [
        new Error('response lost 1'),
        new Error('response lost 2'),
        new Error('response lost 3'),
      ],
    });

    await expect(service.beforeIdentityDeletion({ userId: USER_ID })).rejects.toBeInstanceOf(
      CalendarAccountDeletionError,
    );
    expect(revoke).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalledWith('seal_calendar_account_deletion_v1', expect.anything());
  });

  it('過去dispatchがin_flightならproviderとsealを実行しない', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [
        success([
          {
            operation_id: CANONICAL_OPERATION_ID,
            result: 'in_flight',
            refresh_token_enc: null,
            lease_id: null,
            lease_expires_at: null,
            attempt_deadline_at: null,
          },
        ]),
      ],
    });

    await expect(service.beforeIdentityDeletion({ userId: USER_ID })).rejects.toMatchObject({
      code: 'CALENDAR_ACCOUNT_DELETION_PREPARE_IN_FLIGHT_FAILED',
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('seal_calendar_account_deletion_v1', expect.anything());
  });

  it('in-flight stateをfeature非依存のcontention resultへ変換する', async () => {
    const adapter = createCalendarAccountDeletionAdapter({
      beforeBoundIdentityDeletion: vi.fn(),
      beforeIdentityDeletion: vi
        .fn()
        .mockRejectedValue(new CalendarAccountDeletionError('prepare_in_flight')),
      deleteAllData: vi.fn(),
      prepareDeleteAllData: vi.fn(),
    });

    await expect(adapter.beforeIdentityDeletion({ userId: USER_ID })).resolves.toEqual({
      status: 'contention',
    });
  });

  it('lease期限が近い場合はnot_startedで解放して再prepareする', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [
        prepared(LEASE_ID, NEAR_ATTEMPT_DEADLINE),
        prepared(SECOND_LEASE_ID, ATTEMPT_DEADLINE),
      ],
      finalize_calendar_account_delete_revoke_v1: [success('retried'), success('revoke_guarded')],
      start_calendar_account_delete_provider_attempt_v1: [success('started')],
      seal_calendar_account_deletion_v1: [success(true)],
    });

    await service.beforeIdentityDeletion({ userId: USER_ID });

    expect(revoke).toHaveBeenCalledOnce();
    const finalizeCalls = rpc.mock.calls.filter(
      ([name]) => name === 'finalize_calendar_account_delete_revoke_v1',
    );
    expect(finalizeCalls[0]?.[1]).toEqual(
      expect.objectContaining({ p_lease_id: LEASE_ID, p_outcome: 'not_started' }),
    );
    expect(finalizeCalls[1]?.[1]).toEqual(
      expect.objectContaining({ p_lease_id: SECOND_LEASE_ID, p_outcome: 'confirmed' }),
    );
  });

  it('finalizeのmissingは成功扱いせずseal前で止める', async () => {
    const { revoke, rpc, service } = createService({
      begin_calendar_account_deletion_v1: [beginWithConnection()],
      prepare_calendar_account_delete_revoke_v1: [prepared()],
      start_calendar_account_delete_provider_attempt_v1: [success('started')],
      finalize_calendar_account_delete_revoke_v1: [success('missing')],
    });

    await expect(service.beforeIdentityDeletion({ userId: USER_ID })).rejects.toMatchObject({
      code: 'CALENDAR_ACCOUNT_DELETION_FINALIZE_RESULT_FAILED',
    });
    expect(revoke).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalledWith('seal_calendar_account_deletion_v1', expect.anything());
  });

  it('DBのOAuth client identity不一致ではbeginもproviderも実行しない', async () => {
    const { db, rpc } = createDb({
      get_calendar_authority_readiness_v1: [
        success([{ ...READINESS, oauth_client_id: 'different-client' }]),
      ],
    });
    const revoke = vi.fn();
    const service = createCalendarAccountDeletionService({
      db,
      encryptionKey: ENCRYPTION_KEY,
      generateId: vi.fn(() => REQUESTED_DELETION_ID),
      identity: {
        oauthClientId: READINESS.oauth_client_id,
        projectKey: '123456',
      },
      now: () => NOW,
      provider: { revoke },
    });

    await expect(service.beforeIdentityDeletion({ userId: USER_ID })).rejects.toMatchObject({
      code: 'CALENDAR_ACCOUNT_DELETION_READINESS_RESULT_FAILED',
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('begin_calendar_account_deletion_v1', expect.anything());
  });

  it('inactive authorityではpurge preflightを発行しない', async () => {
    const { db, rpc } = createDb({
      get_calendar_authority_readiness_v1: [success([{ ...READINESS, activated: false }])],
    });
    const service = createCalendarAccountDeletionService({
      db,
      encryptionKey: ENCRYPTION_KEY,
      generateId: vi.fn(),
      identity: {
        oauthClientId: READINESS.oauth_client_id,
        projectKey: '123456',
      },
      now: () => NOW,
      provider: { revoke: vi.fn() },
    });

    await expect(service.prepareDeleteAllData({ userId: USER_ID })).rejects.toMatchObject({
      code: 'CALENDAR_ACCOUNT_DELETION_READINESS_RESULT_FAILED',
    });
    expect(rpc).not.toHaveBeenCalledWith('prepare_user_data_purge_v1', expect.anything());
  });

  it('server-issued purge operationとgenerationをpreflightから返す', async () => {
    const { rpc, service } = createService({
      prepare_user_data_purge_v1: [
        success([
          {
            expected_generation: EXPECTED_GENERATION,
            operation_id: REQUESTED_DELETION_ID,
          },
        ]),
      ],
    });

    await expect(service.prepareDeleteAllData({ userId: USER_ID })).resolves.toEqual({
      expectedGeneration: EXPECTED_GENERATION,
      operationId: REQUESTED_DELETION_ID,
    });
    expect(rpc).toHaveBeenCalledWith('prepare_user_data_purge_v1', {
      p_user_id: USER_ID,
    });
  });

  it('account-preserving purgeをoperation-bound v5へ委譲する', async () => {
    const { rpc, service } = createService({
      delete_all_user_data_command_v5: [success(true)],
    });

    await expect(
      service.deleteAllData({
        expectedGeneration: EXPECTED_GENERATION,
        operationId: REQUESTED_DELETION_ID,
        userId: USER_ID,
      }),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('delete_all_user_data_command_v5', {
      p_expected_generation: EXPECTED_GENERATION,
      p_operation_id: REQUESTED_DELETION_ID,
      p_project_key: '123456',
      p_user_id: USER_ID,
    });
  });

  it('v5 response lossを同じoperation IDで再送する', async () => {
    const { rpc, service } = createService({
      delete_all_user_data_command_v5: [new Error('response lost'), success(true)],
    });

    await expect(
      service.deleteAllData({
        expectedGeneration: EXPECTED_GENERATION,
        operationId: REQUESTED_DELETION_ID,
        userId: USER_ID,
      }),
    ).resolves.toBeUndefined();
    const purgeCalls = rpc.mock.calls.filter(
      ([name]) => name === 'delete_all_user_data_command_v5',
    );
    expect(purgeCalls).toHaveLength(2);
    expect(purgeCalls[0]?.[1]).toEqual(purgeCalls[1]?.[1]);
  });

  it('v5のwriter contentionをretryableな固定codeへ変換する', async () => {
    const contention = { code: '55P03', message: 'private lock detail' };
    const { service } = createService({
      delete_all_user_data_command_v5: [
        { data: null, error: contention },
        { data: null, error: contention },
        { data: null, error: contention },
      ],
    });

    await expect(
      service.deleteAllData({
        expectedGeneration: EXPECTED_GENERATION,
        operationId: REQUESTED_DELETION_ID,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject({
      code: 'CALENDAR_ACCOUNT_DELETION_CONTENTION_FAILED',
      message: 'Calendar account deletion preparation failed',
    });
  });
});
