import { beforeEach, describe, expect, it, vi } from 'vitest';

const processCalendarAuthorityMaintenance = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const createServiceRoleClient = vi.hoisted(() => vi.fn(() => ({ rpc })));
const loggerInfo = vi.hoisted(() => vi.fn());
const cleanupBillingAccountDeletionTerminalReceipts = vi.hoisted(() => vi.fn());

vi.mock('@/features/external-calendar/server/authority-maintenance', () => ({
  processCalendarAuthorityMaintenance,
}));
vi.mock('@/lib/supabase/oauth', () => ({ createServiceRoleClient }));
vi.mock('@/features/settings/server/account-deletion', () => ({
  cleanupBillingAccountDeletionTerminalReceipts,
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: loggerInfo,
    debug: vi.fn(),
  },
}));

import { dispatchExternalConnectionMaintenance } from '../maintenance-dispatcher';

const FAR_DEADLINE = 10 ** 15;

const OUTBOX_SUMMARY = {
  claimed: 4,
  revoked: 2,
  retried: 1,
  expired: 1,
  alreadyGone: 1,
  deadlineReached: false,
  encryptionAvailable: true,
  ciphertextsDeferred: 0,
  guardsFinalized: 2,
  expiredIntentsFound: 1,
  expiredIntentsNormalized: 1,
  revokeOperationsDeleted: 3,
  commandReceiptsDeleted: 4,
  oauthAttemptsDeleted: 5,
  subjectFencesDeleted: 6,
  pendingOperations: 5,
  unboundConnections: 0,
  unboundOutbox: 0,
  cleanupHasMore: false,
  activated: false,
};

const STATUS = {
  calendar_revoke_due: 3,
  calendar_revoke_total: 5,
  oldest_due_age_seconds: 45,
  authorization_codes_due: false,
  access_tokens_due: false,
  refresh_tokens_due: true,
  connections_due: false,
  receipts_due: false,
  security_events_due: false,
};

const CLEAN_STATUS = {
  ...STATUS,
  calendar_revoke_due: 0,
  calendar_revoke_total: 0,
  oldest_due_age_seconds: 0,
  authorization_codes_due: false,
  access_tokens_due: false,
  refresh_tokens_due: false,
  connections_due: false,
  receipts_due: false,
  security_events_due: false,
};

const CLEAN_OUTBOX = {
  ...OUTBOX_SUMMARY,
  claimed: 0,
  revoked: 0,
  retried: 0,
  expired: 0,
  alreadyGone: 0,
  deadlineReached: false,
  pendingOperations: 0,
  activated: true,
};

const CLEANUP_COUNTS: Record<string, number> = {
  cleanup_oauth_authorization_codes_v1: 1,
  cleanup_oauth_access_tokens_v1: 2,
  cleanup_oauth_refresh_tokens_v1: 3,
  cleanup_oauth_connections_v1: 4,
  cleanup_mcp_mutation_receipts_v1: 5,
  cleanup_integration_security_events_v1: 6,
};

function setupRpc(status = STATUS): void {
  rpc.mockImplementation((operation: string) => {
    const result =
      operation === 'get_external_authority_maintenance_status_v1'
        ? { data: [status], error: null }
        : { data: CLEANUP_COUNTS[operation], error: null };
    return { abortSignal: vi.fn(async () => result) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  processCalendarAuthorityMaintenance.mockResolvedValue(OUTBOX_SUMMARY);
  cleanupBillingAccountDeletionTerminalReceipts.mockResolvedValue({
    deleted: 7,
    hasMore: false,
  });
  setupRpc();
});

describe('dispatchExternalConnectionMaintenance', () => {
  it('outbox後に全retention cleanupとaggregate statusを実行する', async () => {
    const sequence: string[] = [];
    processCalendarAuthorityMaintenance.mockImplementation(async () => {
      sequence.push('outbox');
      return OUTBOX_SUMMARY;
    });
    cleanupBillingAccountDeletionTerminalReceipts.mockImplementation(async () => {
      sequence.push('cleanup_billing_account_deletion_terminal_receipts_v2');
      return { deleted: 7, hasMore: false };
    });
    rpc.mockImplementation((operation: string) => {
      sequence.push(operation);
      const result =
        operation === 'get_external_authority_maintenance_status_v1'
          ? { data: [STATUS], error: null }
          : { data: CLEANUP_COUNTS[operation], error: null };
      return { abortSignal: vi.fn(async () => result) };
    });

    const summary = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(processCalendarAuthorityMaintenance).toHaveBeenCalledWith({
      deadlineAt: FAR_DEADLINE - 10_000,
    });
    expect(sequence).toEqual([
      'outbox',
      'cleanup_oauth_authorization_codes_v1',
      'cleanup_oauth_access_tokens_v1',
      'cleanup_oauth_refresh_tokens_v1',
      'cleanup_mcp_mutation_receipts_v1',
      'cleanup_oauth_connections_v1',
      'cleanup_integration_security_events_v1',
      'cleanup_billing_account_deletion_terminal_receipts_v2',
      'get_external_authority_maintenance_status_v1',
    ]);
    expect(summary).toMatchObject({
      complete: false,
      outbox: {
        claimed: 4,
        revoked: 2,
        retried: 1,
        expired: 1,
        alreadyGone: 1,
        guardsFinalized: 2,
        pendingOperations: 5,
        due: 3,
        total: 5,
        oldestDueAgeSeconds: 45,
        deferred: 3,
        ciphertextsDeferred: 0,
        revokeUnavailable: false,
      },
      retention: {
        authorizationCodesDeleted: 1,
        accessTokensDeleted: 2,
        refreshTokensDeleted: 3,
        connectionsDeleted: 4,
        receiptsDeleted: 5,
        securityEventsDeleted: 6,
        billingDeletionReceiptsDeleted: 7,
        hasMore: true,
      },
    });
  });

  it('鍵が無効かつoutboxが残る場合だけrevokeUnavailableにする', async () => {
    processCalendarAuthorityMaintenance.mockResolvedValue({
      ...OUTBOX_SUMMARY,
      encryptionAvailable: false,
    });

    const withBacklog = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });
    expect(withBacklog.outbox.revokeUnavailable).toBe(true);

    setupRpc({ ...STATUS, calendar_revoke_due: 1, calendar_revoke_total: 1 });
    processCalendarAuthorityMaintenance.mockResolvedValue({
      ...CLEAN_OUTBOX,
      encryptionAvailable: false,
      unboundOutbox: 1,
    });
    const withUnboundCiphertext = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });
    expect(withUnboundCiphertext.outbox.revokeUnavailable).toBe(true);

    setupRpc({ ...STATUS, calendar_revoke_due: 0, calendar_revoke_total: 0 });
    processCalendarAuthorityMaintenance.mockResolvedValue({
      ...CLEAN_OUTBOX,
      encryptionAvailable: false,
    });
    const withoutBacklog = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });
    expect(withoutBacklog.outbox.revokeUnavailable).toBe(false);
  });

  it('provider確認済みかつbacklogとretention dueがなければcomplete=trueにする', async () => {
    processCalendarAuthorityMaintenance.mockResolvedValue({
      ...CLEAN_OUTBOX,
      claimed: 1,
      alreadyGone: 1,
    });
    setupRpc(CLEAN_STATUS);

    const summary = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(summary.complete).toBe(true);
  });

  it('Billing terminal receipt cleanupが残件を返したら次回実行を要求する', async () => {
    processCalendarAuthorityMaintenance.mockResolvedValue(CLEAN_OUTBOX);
    rpc.mockImplementation((operation: string) => {
      const result =
        operation === 'get_external_authority_maintenance_status_v1'
          ? { data: [CLEAN_STATUS], error: null }
          : { data: 0, error: null };
      return { abortSignal: vi.fn(async () => result) };
    });
    cleanupBillingAccountDeletionTerminalReceipts.mockResolvedValue({
      deleted: 250,
      hasMore: true,
    });

    const summary = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(summary.complete).toBe(false);
    expect(summary.retention).toMatchObject({
      billingDeletionReceiptsDeleted: 250,
      hasMore: true,
    });
  });

  it.each([
    [
      'retry pending',
      {
        outbox: { ...CLEAN_OUTBOX, retried: 1, pendingOperations: 1 },
        status: CLEAN_STATUS,
      },
    ],
    ['expiry', { outbox: { ...CLEAN_OUTBOX, expired: 1 }, status: CLEAN_STATUS }],
    ['deadline', { outbox: { ...CLEAN_OUTBOX, deadlineReached: true }, status: CLEAN_STATUS }],
    [
      'ciphertext deferred',
      { outbox: { ...CLEAN_OUTBOX, ciphertextsDeferred: 1 }, status: CLEAN_STATUS },
    ],
    [
      'calendar cleanup',
      { outbox: { ...CLEAN_OUTBOX, cleanupHasMore: true }, status: CLEAN_STATUS },
    ],
    [
      'unbound connection',
      { outbox: { ...CLEAN_OUTBOX, unboundConnections: 1 }, status: CLEAN_STATUS },
    ],
    ['unbound outbox', { outbox: { ...CLEAN_OUTBOX, unboundOutbox: 1 }, status: CLEAN_STATUS }],
    ['authority inactive', { outbox: { ...CLEAN_OUTBOX, activated: false }, status: CLEAN_STATUS }],
    [
      'calendar backlog',
      { outbox: CLEAN_OUTBOX, status: { ...CLEAN_STATUS, calendar_revoke_total: 1 } },
    ],
    [
      'authorization code retention',
      { outbox: CLEAN_OUTBOX, status: { ...CLEAN_STATUS, authorization_codes_due: true } },
    ],
    [
      'access token retention',
      { outbox: CLEAN_OUTBOX, status: { ...CLEAN_STATUS, access_tokens_due: true } },
    ],
    [
      'refresh token retention',
      { outbox: CLEAN_OUTBOX, status: { ...CLEAN_STATUS, refresh_tokens_due: true } },
    ],
    [
      'connection retention',
      { outbox: CLEAN_OUTBOX, status: { ...CLEAN_STATUS, connections_due: true } },
    ],
    [
      'receipt retention',
      { outbox: CLEAN_OUTBOX, status: { ...CLEAN_STATUS, receipts_due: true } },
    ],
    [
      'security event retention',
      { outbox: CLEAN_OUTBOX, status: { ...CLEAN_STATUS, security_events_due: true } },
    ],
  ])('%sが残る時はcomplete=falseにする', async (_name, scenario) => {
    processCalendarAuthorityMaintenance.mockResolvedValue(scenario.outbox);
    setupRpc(scenario.status);

    const summary = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    expect(summary.complete).toBe(false);
  });

  it('outbox失敗後も全retentionとstatusを実行し、raw errorを再送出しない', async () => {
    const sensitive = 'v1.secret-ciphertext';
    processCalendarAuthorityMaintenance.mockRejectedValue(new Error(sensitive));

    const operation = dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    await expect(operation).rejects.toMatchObject({
      name: 'ExternalConnectionMaintenanceError',
      message: 'External connection maintenance failed',
    });
    await expect(operation).rejects.not.toThrow(sensitive);
    expect(rpc).toHaveBeenCalledTimes(7);
    expect(cleanupBillingAccountDeletionTerminalReceipts).toHaveBeenCalledTimes(1);
  });

  it('1つのcleanup失敗でも残りのcleanupとstatusを続ける', async () => {
    rpc.mockImplementation((operation: string) => {
      const result =
        operation === 'cleanup_oauth_access_tokens_v1'
          ? { data: null, error: { message: 'database unavailable' } }
          : operation === 'get_external_authority_maintenance_status_v1'
            ? { data: [STATUS], error: null }
            : { data: CLEANUP_COUNTS[operation], error: null };
      return { abortSignal: vi.fn(async () => result) };
    });

    await expect(
      dispatchExternalConnectionMaintenance({ deadlineAt: FAR_DEADLINE }),
    ).rejects.toMatchObject({
      name: 'ExternalConnectionMaintenanceError',
      message: 'External connection maintenance failed',
    });
    expect(rpc).toHaveBeenCalledTimes(7);
    expect(cleanupBillingAccountDeletionTerminalReceipts).toHaveBeenCalledTimes(1);
  });

  it('ログと返却値はaggregateだけで秘密情報やIDを含まない', async () => {
    const summary = await dispatchExternalConnectionMaintenance({
      deadlineAt: FAR_DEADLINE,
    });

    const serialized = JSON.stringify({ summary, log: loggerInfo.mock.calls });
    expect(serialized).not.toContain('refresh_token');
    expect(serialized).not.toContain('outbox_id');
    expect(serialized).not.toContain('lease_id');
    expect(serialized).not.toContain('user_id');
    expect(serialized).not.toContain('connection_id');
  });
});
