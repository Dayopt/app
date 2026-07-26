import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExternalConnectionMaintenanceSummary } from '../maintenance-dispatcher';

const dispatchExternalConnectionMaintenance = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(
  () => ({ CRON_SECRET: 'super-secret-cron' }) as { CRON_SECRET?: string | undefined },
);

vi.mock('@/env', () => ({ env: envMock }));
vi.mock('../maintenance-dispatcher', () => ({ dispatchExternalConnectionMaintenance }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));
vi.mock('@/lib/logger', () => ({
  logger: {
    log: vi.fn(),
    error: loggerError,
    warn: loggerWarn,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GET } from '../route';

const URL = 'https://app.dayopt.app/api/cron/external-connection-maintenance';

const SUMMARY = {
  complete: false,
  outbox: {
    claimed: 2,
    revoked: 1,
    retried: 1,
    expired: 0,
    alreadyGone: 0,
    guardsFinalized: 0,
    expiredIntentsFound: 0,
    expiredIntentsNormalized: 0,
    revokeOperationsDeleted: 0,
    commandReceiptsDeleted: 0,
    oauthAttemptsDeleted: 0,
    subjectFencesDeleted: 0,
    pendingOperations: 2,
    unboundConnections: 0,
    unboundOutbox: 0,
    activated: false,
    due: 1,
    total: 2,
    oldestDueAgeSeconds: 30,
    deferred: 1,
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
    hasMore: false,
  },
  durationMs: 120,
} satisfies ExternalConnectionMaintenanceSummary;

function request(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest(URL, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.CRON_SECRET = 'super-secret-cron';
  dispatchExternalConnectionMaintenance.mockResolvedValue(SUMMARY);
});

describe('external connection maintenance cron', () => {
  it('CRON_SECRET未設定なら503でdispatcherを呼ばない', async () => {
    envMock.CRON_SECRET = undefined;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(dispatchExternalConnectionMaintenance).not.toHaveBeenCalled();
  });

  it('CRON_SECRETが16文字未満なら503でdispatcherを呼ばない', async () => {
    envMock.CRON_SECRET = 'too-short';

    const response = await GET(request('Bearer too-short'));

    expect(response.status).toBe(503);
    expect(dispatchExternalConnectionMaintenance).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'Bearer wrong-secret', 'super-secret-cron'])(
    'Bearer認証不一致(%s)は401',
    async (authorization) => {
      const response = await GET(request(authorization));

      expect(response.status).toBe(401);
      expect(dispatchExternalConnectionMaintenance).not.toHaveBeenCalled();
    },
  );

  it('認証成功時はaggregate summaryだけを返す', async () => {
    const response = await GET(request('Bearer super-secret-cron'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({ ok: true, ...SUMMARY });
    expect(dispatchExternalConnectionMaintenance).toHaveBeenCalledWith({
      deadlineAt: expect.any(Number),
    });
    expect(loggerWarn).toHaveBeenCalledWith(
      '[external-connection-maintenance] work remains after dispatch',
    );
  });

  it('暗号鍵が使えずoutboxが残る場合はcleanup後に503を返す', async () => {
    dispatchExternalConnectionMaintenance.mockResolvedValue({
      ...SUMMARY,
      outbox: { ...SUMMARY.outbox, revokeUnavailable: true },
    });

    const response = await GET(request('Bearer super-secret-cron'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      error: 'Calendar revoke is unavailable',
      outbox: { revokeUnavailable: true },
    });
    expect(loggerError).toHaveBeenCalledWith(
      '[external-connection-maintenance] revoke key is unavailable',
    );
  });

  it('dispatcher失敗は安全な500とSentry通知に変換する', async () => {
    const error = new Error('v1.secret-ciphertext');
    dispatchExternalConnectionMaintenance.mockRejectedValue(error);

    const response = await GET(request('Bearer super-secret-cron'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Maintenance dispatch failed' });
    expect(captureUnexpectedError).toHaveBeenCalledWith(expect.any(Error), {
      feature: 'external_connection_maintenance',
      operation: 'cron_dispatch',
      route: '/api/cron/external-connection-maintenance',
    });
    const captured = captureUnexpectedError.mock.calls[0]?.[0] as Error;
    expect(captured).not.toBe(error);
    expect(captured.message).toBe('External connection maintenance dispatch failed');
    expect(JSON.stringify(captureUnexpectedError.mock.calls)).not.toContain(error.message);
    expect(loggerError).toHaveBeenCalledWith('[external-connection-maintenance] dispatch failed');
  });

  it('未確認のhard expiryは200のincomplete結果と安全化済み通知にする', async () => {
    dispatchExternalConnectionMaintenance.mockResolvedValue({
      ...SUMMARY,
      outbox: { ...SUMMARY.outbox, expired: 1 },
    });

    const response = await GET(request('Bearer super-secret-cron'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, complete: false, outbox: { expired: 1 } });
    expect(captureUnexpectedError).toHaveBeenCalledWith(expect.any(Error), {
      feature: 'external_connection_maintenance',
      operation: 'revoke_expired',
      route: '/api/cron/external-connection-maintenance',
    });
    const captured = captureUnexpectedError.mock.calls[0]?.[0] as Error;
    expect(captured.message).toBe('Calendar revoke expired before confirmation');
  });
});
