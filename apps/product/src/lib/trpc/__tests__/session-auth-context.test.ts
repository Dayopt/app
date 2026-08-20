import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: mocks.loggerWarn },
}));

vi.mock('@/lib/sentry', () => ({
  observeAuthOperation: (_operation: string, call: () => PromiseLike<unknown>) => call(),
}));

import { resolveSessionAuthContext } from '../session-auth-context';

function createSupabaseMock(options: {
  user?: { id: string } | null;
  userError?: unknown;
  sessionResult?: unknown;
  sessionError?: unknown;
  mfaData?: { currentLevel: unknown; nextLevel: unknown } | null | undefined;
  mfaError?: unknown;
}) {
  const getSession = vi.fn();
  if (options.sessionError instanceof Error) {
    getSession.mockRejectedValue(options.sessionError);
  } else {
    getSession.mockResolvedValue({
      data: {
        session:
          options.sessionResult === undefined
            ? { access_token: 'session-token' }
            : options.sessionResult,
      },
      error: options.sessionError ?? null,
    });
  }

  const getAuthenticatorAssuranceLevel = vi.fn();
  if (options.mfaError instanceof Error) {
    getAuthenticatorAssuranceLevel.mockRejectedValue(options.mfaError);
  } else {
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data:
        options.mfaData === undefined
          ? { currentLevel: 'aal1', nextLevel: 'aal1' }
          : options.mfaData,
      error: options.mfaError ?? null,
    });
  }

  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: options.user === undefined ? { id: 'user-1' } : options.user },
          error: options.userError ?? null,
        }),
        getSession,
        mfa: { getAuthenticatorAssuranceLevel },
      },
    },
    getSession,
    getAuthenticatorAssuranceLevel,
  };
}

describe('resolveSessionAuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips session and MFA lookups when no verified user exists', async () => {
    const { client, getSession, getAuthenticatorAssuranceLevel } = createSupabaseMock({
      user: null,
    });

    await expect(resolveSessionAuthContext(client as never, 'trpc_context')).resolves.toEqual({});
    expect(getSession).not.toHaveBeenCalled();
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it.each([
    { currentLevel: 'aal1', nextLevel: 'aal1' },
    { currentLevel: 'aal1', nextLevel: 'aal2' },
    { currentLevel: 'aal2', nextLevel: 'aal2' },
    // #2150: MFA無効化直後、JWT由来のcurrentLevelがaal2のままnextLevelが
    // aal1（実際のfactor状態）になる正常な降格。lookupFailedにしない。
    { currentLevel: 'aal2', nextLevel: 'aal1' },
  ])('returns a valid $currentLevel -> $nextLevel assurance pair', async (mfaData) => {
    const { client, getAuthenticatorAssuranceLevel } = createSupabaseMock({ mfaData });

    await expect(resolveSessionAuthContext(client as never, 'trpc_context')).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-token',
      mfaAssurance: mfaData,
    });
    // #2047: server未検証のcookie storageではなくjwt引数付きで呼び、
    // 内部でgetUser(jwt)によるserver検証済みfactorsを使わせる。
    expect(getAuthenticatorAssuranceLevel).toHaveBeenCalledWith('session-token');
  });

  it('fails closed when the session lookup for MFA fails', async () => {
    const { client, getAuthenticatorAssuranceLevel } = createSupabaseMock({
      sessionError: { message: 'session lookup failed' },
    });

    await expect(resolveSessionAuthContext(client as never, 'trpc_context')).resolves.toMatchObject(
      {
        userId: 'user-1',
        mfaAssurance: { currentLevel: null, nextLevel: null, lookupFailed: true },
      },
    );
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it('treats a missing session as aal1 (no AAL claim to normalize)', async () => {
    const { client, getAuthenticatorAssuranceLevel } = createSupabaseMock({
      sessionResult: null,
    });

    await expect(resolveSessionAuthContext(client as never, 'trpc_context')).resolves.toMatchObject(
      {
        userId: 'user-1',
        mfaAssurance: { currentLevel: 'aal1', nextLevel: 'aal1' },
      },
    );
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'no enrolled factor',
      mfaData: { currentLevel: null, nextLevel: null },
      expected: { currentLevel: 'aal1', nextLevel: 'aal1' },
    },
    {
      label: 'an enrolled factor',
      mfaData: { currentLevel: null, nextLevel: 'aal2' },
      expected: { currentLevel: 'aal1', nextLevel: 'aal2' },
    },
  ])('normalizes a missing current AAL claim for $label', async ({ mfaData, expected }) => {
    const { client } = createSupabaseMock({ mfaData });

    await expect(resolveSessionAuthContext(client as never, 'trpc_context')).resolves.toMatchObject(
      {
        mfaAssurance: expected,
      },
    );
  });

  it('fails closed for both sessionId and MFA lookup when getSession throws', async () => {
    // #2047: resolveMfaAssurance は AAL 判定に session.access_token(jwt) を要求するため、
    // sessionIdの抽出に使うgetSession()自体がthrowする状況ではMFA判定も自前で
    // getSession()に依存し、同じ理由でfail-closedになる（以前は独立したSDK呼び出し
    // だったため、session token lookupの失敗はMFA判定に影響しなかった）。
    const { client, getAuthenticatorAssuranceLevel } = createSupabaseMock({
      sessionError: new Error('session unavailable'),
      mfaData: { currentLevel: 'aal1', nextLevel: 'aal2' },
    });

    await expect(resolveSessionAuthContext(client as never, 'rsc_trpc')).resolves.toMatchObject({
      userId: 'user-1',
      sessionId: undefined,
      mfaAssurance: { currentLevel: null, nextLevel: null, lookupFailed: true },
    });
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'returned error', mfaError: { message: 'lookup failed' } },
    { label: 'thrown error', mfaError: new Error('lookup failed') },
    { label: 'null data', mfaData: null },
    { label: 'unknown level', mfaData: { currentLevel: 'aal3', nextLevel: 'aal3' } },
  ])('fails closed for $label', async ({ mfaData, mfaError }) => {
    const { client } = createSupabaseMock({ mfaData, mfaError });

    await expect(resolveSessionAuthContext(client as never, 'trpc_context')).resolves.toMatchObject(
      {
        userId: 'user-1',
        mfaAssurance: { currentLevel: null, nextLevel: null, lookupFailed: true },
      },
    );
  });
});
