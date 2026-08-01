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
  ])('returns a valid $currentLevel -> $nextLevel assurance pair', async (mfaData) => {
    const { client } = createSupabaseMock({ mfaData });

    await expect(resolveSessionAuthContext(client as never, 'trpc_context')).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-token',
      mfaAssurance: mfaData,
    });
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

  it('continues the MFA lookup after the session token lookup throws', async () => {
    const { client, getAuthenticatorAssuranceLevel } = createSupabaseMock({
      sessionError: new Error('session unavailable'),
      mfaData: { currentLevel: 'aal1', nextLevel: 'aal2' },
    });

    await expect(resolveSessionAuthContext(client as never, 'rsc_trpc')).resolves.toEqual({
      userId: 'user-1',
      sessionId: undefined,
      mfaAssurance: { currentLevel: 'aal1', nextLevel: 'aal2' },
    });
    expect(getAuthenticatorAssuranceLevel).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'returned error', mfaError: { message: 'lookup failed' } },
    { label: 'thrown error', mfaError: new Error('lookup failed') },
    { label: 'null data', mfaData: null },
    { label: 'unknown level', mfaData: { currentLevel: 'aal3', nextLevel: 'aal3' } },
    { label: 'invalid downgrade', mfaData: { currentLevel: 'aal2', nextLevel: 'aal1' } },
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
