import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const createServiceRoleClient = vi.hoisted(() => vi.fn(() => ({ rpc })));
const revoke = vi.hoisted(() => vi.fn());
const decryptToken = vi.hoisted(() => vi.fn());
const isValidEncryptionKey = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const getConfiguredGoogleCalendarProjectKey = vi.hoisted(() => vi.fn());
const resolveGoogleCalendarAuthorityIdentity = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(
  () =>
    ({ CALENDAR_TOKEN_ENCRYPTION_KEY: 'valid-test-key' }) as {
      CALENDAR_TOKEN_ENCRYPTION_KEY?: string | undefined;
    },
);

vi.mock('@/env', () => ({ env: envMock }));
vi.mock('@/lib/supabase/oauth', () => ({ createServiceRoleClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));
vi.mock('../authority-config', () => ({
  getConfiguredGoogleCalendarProjectKey,
  resolveGoogleCalendarAuthorityIdentity,
}));
vi.mock('../providers/google', () => ({ googleCalendarAdapter: { revoke } }));
vi.mock('../token-crypto', () => ({ decryptToken, isValidEncryptionKey }));

import { processCalendarAuthorityMaintenance } from '../authority-maintenance';

const PROJECT_KEY = '123456789012';
const OAUTH_CLIENT_ID = `${PROJECT_KEY}-dayoptcalendar.apps.googleusercontent.com`;
const VALID_KEY = 'valid-test-key';
const CIPHERTEXT = 'v1.secret-ciphertext';
const PLAINTEXT = 'provider-refresh-token';
const FAR_DEADLINE = 10 ** 15;

const CLAIM = {
  outbox_id: '00000000-0000-4000-8000-000000000001',
  lease_id: '10000000-0000-4000-8000-000000000001',
  provider: 'google',
  refresh_token_enc: CIPHERTEXT,
  expires_at: '9999-01-01T00:00:00.000Z',
  lease_expires_at: '9999-01-01T00:00:00.000Z',
  attempt_deadline_at: '9999-01-01T00:00:00.000Z',
  attempt_count: 1,
};

const READINESS = {
  oauth_client_id: OAUTH_CLIENT_ID,
  activated: false,
  project_epoch: 3,
  project_state: 'ready',
  pending_operations: 0,
  unbound_connections: 0,
  unbound_outbox: 0,
};

type RpcResult = { data: unknown; error: unknown };

type RpcOverrides = {
  expiry?: { ciphertexts_deleted: number; ciphertexts_deferred: number };
  claims?: (typeof CLAIM)[];
  finalize?: string;
  guardsFinalized?: number;
  intents?: Array<{ user_id: string; deletion_id: string }>;
  normalize?: string;
  operationsDeleted?: number;
  retention?: {
    command_receipts_deleted: number;
    oauth_attempts_deleted: number;
    subject_fences_deleted: number;
  };
  readiness?: typeof READINESS;
};

function resultForOperation(operation: string, overrides: RpcOverrides): RpcResult {
  switch (operation) {
    case 'expire_calendar_revoke_authority_v3':
      return {
        data: [
          overrides.expiry ?? {
            ciphertexts_deleted: 0,
            ciphertexts_deferred: 0,
          },
        ],
        error: null,
      };
    case 'claim_calendar_revoke_outbox_v2':
      return { data: overrides.claims ?? [], error: null };
    case 'finalize_calendar_revoke_attempt_v2':
      return { data: overrides.finalize ?? 'revoke_guarded', error: null };
    case 'finalize_calendar_revoke_guards_v1':
      return { data: overrides.guardsFinalized ?? 0, error: null };
    case 'list_expired_calendar_account_deletion_intents_v1':
      return { data: overrides.intents ?? [], error: null };
    case 'normalize_calendar_account_deletion_intent_v1':
      return { data: overrides.normalize ?? 'normalized', error: null };
    case 'cleanup_calendar_revoke_operations_v1':
      return { data: overrides.operationsDeleted ?? 0, error: null };
    case 'cleanup_calendar_authority_retention_v1':
      return {
        data: [
          overrides.retention ?? {
            command_receipts_deleted: 0,
            oauth_attempts_deleted: 0,
            subject_fences_deleted: 0,
          },
        ],
        error: null,
      };
    case 'get_calendar_authority_readiness_v1':
      return { data: [overrides.readiness ?? READINESS], error: null };
    default:
      throw new Error(`Unexpected RPC: ${operation}`);
  }
}

function setupRpc(overrides: RpcOverrides = {}): void {
  rpc.mockImplementation((operation: string) => {
    const result = resultForOperation(operation, overrides);
    return { abortSignal: vi.fn(async () => result) };
  });
}

function operationSequence(): string[] {
  return rpc.mock.calls.map(([operation]) => operation as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.CALENDAR_TOKEN_ENCRYPTION_KEY = VALID_KEY;
  getConfiguredGoogleCalendarProjectKey.mockReturnValue(PROJECT_KEY);
  resolveGoogleCalendarAuthorityIdentity.mockReturnValue({
    projectKey: PROJECT_KEY,
    oauthClientId: OAUTH_CLIENT_ID,
  });
  isValidEncryptionKey.mockReturnValue(true);
  decryptToken.mockReturnValue(PLAINTEXT);
  revoke.mockResolvedValue(true);
  setupRpc();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processCalendarAuthorityMaintenance', () => {
  it('hard expiryからreadinessまでproject identity付き新契約を順番に実行する', async () => {
    const intent = {
      user_id: '20000000-0000-4000-8000-000000000001',
      deletion_id: '30000000-0000-4000-8000-000000000001',
    };
    setupRpc({
      expiry: { ciphertexts_deleted: 2, ciphertexts_deferred: 0 },
      claims: [CLAIM],
      guardsFinalized: 3,
      intents: [intent],
      operationsDeleted: 4,
      retention: {
        command_receipts_deleted: 5,
        oauth_attempts_deleted: 6,
        subject_fences_deleted: 7,
      },
      readiness: { ...READINESS, pending_operations: 1 },
    });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(operationSequence()).toEqual([
      'expire_calendar_revoke_authority_v3',
      'get_calendar_authority_readiness_v1',
      'claim_calendar_revoke_outbox_v2',
      'finalize_calendar_revoke_attempt_v2',
      'finalize_calendar_revoke_guards_v1',
      'list_expired_calendar_account_deletion_intents_v1',
      'normalize_calendar_account_deletion_intent_v1',
      'cleanup_calendar_revoke_operations_v1',
      'cleanup_calendar_authority_retention_v1',
      'get_calendar_authority_readiness_v1',
    ]);
    expect(rpc).toHaveBeenCalledWith('expire_calendar_revoke_authority_v3', {
      p_project_key: PROJECT_KEY,
      p_limit: 250,
    });
    expect(rpc).toHaveBeenCalledWith('claim_calendar_revoke_outbox_v2', {
      p_project_key: PROJECT_KEY,
      p_limit: 5,
    });
    expect(rpc).toHaveBeenCalledWith('finalize_calendar_revoke_attempt_v2', {
      p_project_key: PROJECT_KEY,
      p_outbox_id: CLAIM.outbox_id,
      p_lease_id: CLAIM.lease_id,
      p_outcome: 'confirmed',
    });
    expect(rpc).toHaveBeenCalledWith('normalize_calendar_account_deletion_intent_v1', {
      p_project_key: PROJECT_KEY,
      p_user_id: intent.user_id,
      p_deletion_id: intent.deletion_id,
    });
    expect(rpc).toHaveBeenCalledWith('get_calendar_authority_readiness_v1', {
      p_project_key: PROJECT_KEY,
      p_oauth_client_id: OAUTH_CLIENT_ID,
    });
    expect(decryptToken).toHaveBeenCalledWith(CIPHERTEXT, VALID_KEY);
    expect(revoke).toHaveBeenCalledWith(PLAINTEXT);
    expect(summary).toMatchObject({
      claimed: 1,
      revoked: 1,
      retried: 0,
      expired: 2,
      guardsFinalized: 3,
      expiredIntentsFound: 1,
      expiredIntentsNormalized: 1,
      revokeOperationsDeleted: 4,
      commandReceiptsDeleted: 5,
      oauthAttemptsDeleted: 6,
      subjectFencesDeleted: 7,
      pendingOperations: 1,
    });
  });

  it('OAuth identityが不整合でもconfigured projectのhard expiryと安全なcleanupを先に行う', async () => {
    resolveGoogleCalendarAuthorityIdentity.mockReturnValue(null);
    setupRpc({ expiry: { ciphertexts_deleted: 2, ciphertexts_deferred: 0 } });

    await expect(
      processCalendarAuthorityMaintenance({
        deadlineAt: FAR_DEADLINE,
      }),
    ).rejects.toMatchObject({
      name: 'CalendarAuthorityMaintenanceError',
      message: 'Calendar authority maintenance failed',
      code: 'CALENDAR_AUTHORITY_IDENTITY_FAILED',
    });

    expect(operationSequence()).toEqual([
      'expire_calendar_revoke_authority_v3',
      'finalize_calendar_revoke_guards_v1',
      'list_expired_calendar_account_deletion_intents_v1',
      'cleanup_calendar_revoke_operations_v1',
      'cleanup_calendar_authority_retention_v1',
    ]);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('hard expiryが失敗したrunではclaimせず、独立cleanup後に固定errorを返す', async () => {
    rpc.mockImplementation((operation: string) => {
      const result =
        operation === 'expire_calendar_revoke_authority_v3'
          ? { data: null, error: { message: CIPHERTEXT } }
          : resultForOperation(operation, {});
      return { abortSignal: vi.fn(async () => result) };
    });

    const operation = processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    await expect(operation).rejects.toMatchObject({
      name: 'CalendarAuthorityMaintenanceError',
      message: 'Calendar authority maintenance failed',
      code: 'CALENDAR_AUTHORITY_EXPIRE_FAILED',
    });
    await expect(operation).rejects.not.toThrow(CIPHERTEXT);
    expect(operationSequence()).not.toContain('claim_calendar_revoke_outbox_v2');
    expect(operationSequence()).toContain('get_calendar_authority_readiness_v1');
  });

  it('DBの完全なOAuth client identityをprovider前に検証し、不一致ならclaimしない', async () => {
    let readinessAttempt = 0;
    rpc.mockImplementation((operation: string) => {
      let result = resultForOperation(operation, {});
      if (operation === 'get_calendar_authority_readiness_v1') {
        readinessAttempt += 1;
        result =
          readinessAttempt === 1
            ? { data: null, error: { message: 'identity mismatch' } }
            : { data: [READINESS], error: null };
      }
      return { abortSignal: vi.fn(async () => result) };
    });

    await expect(
      processCalendarAuthorityMaintenance({ deadlineAt: FAR_DEADLINE }),
    ).rejects.toMatchObject({
      name: 'CalendarAuthorityMaintenanceError',
      code: 'CALENDAR_AUTHORITY_READINESS_FAILED',
    });

    expect(operationSequence()).not.toContain('claim_calendar_revoke_outbox_v2');
    expect(revoke).not.toHaveBeenCalled();
    expect(
      operationSequence().filter(
        (operation) => operation === 'get_calendar_authority_readiness_v1',
      ),
    ).toHaveLength(2);
  });

  it('暗号鍵が無効でもhard expiryとcleanupを実行し、claimだけ止める', async () => {
    isValidEncryptionKey.mockReturnValue(false);
    envMock.CALENDAR_TOKEN_ENCRYPTION_KEY = undefined;
    setupRpc({
      expiry: { ciphertexts_deleted: 3, ciphertexts_deferred: 1 },
      claims: [CLAIM],
    });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(operationSequence()).not.toContain('claim_calendar_revoke_outbox_v2');
    expect(operationSequence()[0]).toBe('expire_calendar_revoke_authority_v3');
    expect(summary).toMatchObject({
      expired: 3,
      ciphertextsDeferred: 1,
      encryptionAvailable: false,
      cleanupHasMore: true,
    });
  });

  it.each([
    ['provider false', false],
    ['provider throw', 'throw'],
  ])('%sはHTTP開始済みとしてunconfirmedでfinalizeする', async (_name, behavior) => {
    setupRpc({ claims: [CLAIM], finalize: 'retried' });
    if (behavior === 'throw') revoke.mockRejectedValue(new Error(`provider ${PLAINTEXT}`));
    else revoke.mockResolvedValue(false);

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(rpc).toHaveBeenCalledWith('finalize_calendar_revoke_attempt_v2', {
      p_project_key: PROJECT_KEY,
      p_outbox_id: CLAIM.outbox_id,
      p_lease_id: CLAIM.lease_id,
      p_outcome: 'unconfirmed',
    });
    expect(summary).toMatchObject({ claimed: 1, revoked: 0, retried: 1 });
    expect(captureUnexpectedError).toHaveBeenCalledTimes(behavior === 'throw' ? 1 : 0);
  });

  it.each([
    ['decrypt failure', 'decrypt'],
    ['unsupported provider', 'provider'],
  ])('%sはproviderを始めずnot_startedでfinalizeする', async (_name, failure) => {
    const claim = failure === 'provider' ? { ...CLAIM, provider: 'unsupported' } : CLAIM;
    setupRpc({ claims: [claim], finalize: 'retried' });
    if (failure === 'decrypt') {
      decryptToken.mockImplementation(() => {
        throw new Error(`decrypt failed for ${CIPHERTEXT}`);
      });
    }

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(revoke).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('finalize_calendar_revoke_attempt_v2', {
      p_project_key: PROJECT_KEY,
      p_outbox_id: claim.outbox_id,
      p_lease_id: claim.lease_id,
      p_outcome: 'not_started',
    });
    expect(summary.retried).toBe(1);
    expect(captureUnexpectedError).toHaveBeenCalledTimes(1);

    const report = JSON.stringify(captureUnexpectedError.mock.calls);
    expect(report).not.toContain(CIPHERTEXT);
    expect(report).not.toContain(PLAINTEXT);
    expect(report).not.toContain(CLAIM.outbox_id);
    expect(report).not.toContain(CLAIM.lease_id);
  });

  it('DB発行attempt deadlineの余白がなければproviderを始めずnot_startedに戻す', async () => {
    setupRpc({
      claims: [
        {
          ...CLAIM,
          attempt_deadline_at: new Date(Date.now() + 10_000).toISOString(),
        },
      ],
      finalize: 'retried',
    });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(revoke).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'finalize_calendar_revoke_attempt_v2',
      expect.objectContaining({ p_outcome: 'not_started' }),
    );
    expect(summary).toMatchObject({
      claimed: 1,
      retried: 1,
      deadlineReached: true,
    });
  });

  it('global deadlineの余白がなければclaimせずcleanupへ進む', async () => {
    setupRpc({ claims: [CLAIM] });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: Date.now() + 16_000,
    });

    expect(operationSequence()).not.toContain('claim_calendar_revoke_outbox_v2');
    expect(operationSequence()).toContain('cleanup_calendar_authority_retention_v1');
    expect(summary).toMatchObject({ claimed: 0, deadlineReached: true });
  });

  it('finalize response lossは同じlease/outcomeだけを再送しproviderを再実行しない', async () => {
    let finalizeAttempt = 0;
    rpc.mockImplementation((operation: string) => {
      let result = resultForOperation(operation, { claims: [CLAIM] });
      if (operation === 'finalize_calendar_revoke_attempt_v2') {
        finalizeAttempt += 1;
        result =
          finalizeAttempt === 1
            ? { data: null, error: { message: CIPHERTEXT } }
            : { data: 'revoke_guarded', error: null };
      }
      return { abortSignal: vi.fn(async () => result) };
    });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    const finalizations = rpc.mock.calls.filter(
      ([operation]) => operation === 'finalize_calendar_revoke_attempt_v2',
    );
    expect(finalizations).toHaveLength(2);
    expect(finalizations[0]?.[1]).toEqual(finalizations[1]?.[1]);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(summary.revoked).toBe(1);
  });

  it.each(['missing', 'superseded'])(
    'finalize結果%sは既処理とみなさず固定failureにする',
    async (finalize) => {
      setupRpc({ claims: [CLAIM], finalize });

      const operation = processCalendarAuthorityMaintenance({
        deadlineAt: FAR_DEADLINE,
      });

      await expect(operation).rejects.toMatchObject({
        name: 'CalendarAuthorityMaintenanceError',
        code: 'CALENDAR_AUTHORITY_REVOKE_OUTBOX_FAILED',
      });
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(operationSequence()).toContain('cleanup_calendar_authority_retention_v1');
    },
  );

  it('同batchの1件がfinalize失敗しても全leaseのsettlement完了を待つ', async () => {
    const secondClaim = {
      ...CLAIM,
      outbox_id: '00000000-0000-4000-8000-000000000002',
      lease_id: '10000000-0000-4000-8000-000000000002',
    };
    let secondSettled = false;
    rpc.mockImplementation((operation: string, args?: { p_outbox_id?: string }) => {
      return {
        abortSignal: vi.fn(async () => {
          if (operation === 'claim_calendar_revoke_outbox_v2') {
            return { data: [CLAIM, secondClaim], error: null };
          }
          if (operation === 'finalize_calendar_revoke_attempt_v2') {
            if (args?.p_outbox_id === CLAIM.outbox_id) {
              return { data: null, error: { message: CIPHERTEXT } };
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
            secondSettled = true;
            return { data: 'revoke_guarded', error: null };
          }
          return resultForOperation(operation, {});
        }),
      };
    });

    const operation = processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    await expect(operation).rejects.toMatchObject({
      name: 'CalendarAuthorityMaintenanceError',
      message: 'Calendar authority maintenance failed',
    });
    expect(secondSettled).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('1 runは5件ずつ最大20件までclaimする', async () => {
    let nextIndex = 0;
    rpc.mockImplementation((operation: string, args?: { p_limit?: number }) => {
      return {
        abortSignal: vi.fn(async () => {
          if (operation === 'claim_calendar_revoke_outbox_v2') {
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
          return resultForOperation(operation, {});
        }),
      };
    });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    const claims = rpc.mock.calls.filter(
      ([operation]) => operation === 'claim_calendar_revoke_outbox_v2',
    );
    expect(claims).toHaveLength(4);
    expect(claims.every(([, args]) => args.p_limit === 5)).toBe(true);
    expect(summary).toMatchObject({ claimed: 20, revoked: 20 });
    expect(revoke).toHaveBeenCalledTimes(20);
  });

  it('provider settlement後に予算を失ったら後段cleanupを次runへ送る', async () => {
    const baseNow = 1_800_000_000_000;
    let currentNow = baseNow;
    vi.spyOn(Date, 'now').mockImplementation(() => currentNow);
    rpc.mockImplementation((operation: string) => {
      const result = resultForOperation(operation, { claims: [CLAIM] });
      return {
        abortSignal: vi.fn(async () => {
          if (operation === 'finalize_calendar_revoke_attempt_v2') {
            currentNow = baseNow + 45_500;
          }
          return result;
        }),
      };
    });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: baseNow + 50_000,
    });

    expect(operationSequence()).toEqual([
      'expire_calendar_revoke_authority_v3',
      'get_calendar_authority_readiness_v1',
      'claim_calendar_revoke_outbox_v2',
      'finalize_calendar_revoke_attempt_v2',
      'get_calendar_authority_readiness_v1',
    ]);
    expect(summary).toMatchObject({
      claimed: 1,
      revoked: 1,
      deadlineReached: true,
      cleanupHasMore: true,
    });
  });

  it('各cleanupのbatch上限到達とdeferredをcleanupHasMoreへ集約する', async () => {
    setupRpc({
      guardsFinalized: 250,
      operationsDeleted: 250,
      retention: {
        command_receipts_deleted: 250,
        oauth_attempts_deleted: 0,
        subject_fences_deleted: 0,
      },
    });

    const summary = await processCalendarAuthorityMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(summary.cleanupHasMore).toBe(true);
  });
});
