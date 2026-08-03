import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new RedirectSignal(url);
  }),
);
const validateAuthorizeInput = vi.hoisted(() => vi.fn());
const assertTokenIssuanceDatabaseIdentity = vi.hoisted(() => vi.fn());
const grantRpc = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());

/** `next/navigation` の redirect と同様に throw で制御を打ち切るテスト用シグナル。 */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect: ${url}`);
  }
}

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/sentry', () => ({
  observeAuthOperation: (_operation: string, run: () => unknown) => run(),
  captureUnexpectedDatabaseError: vi.fn((error: unknown) => error),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/oauth-server/authorization-request-host', () => ({
  assertOAuthAuthorizationRequestHost: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/oauth-server', () => ({
  assertTokenIssuanceDatabaseIdentity,
  createOAuthDbClient: () => ({ rpc: grantRpc }),
  generateAuthorizationCode: () => ({ code: 'issued-code', hash: 'issued-code-hash' }),
  hasWriteScope: () => false,
  isRuntimeClientWriteEnabled: () => false,
  validateAuthorizeInput,
}));

import { processConsent } from '../actions';

function createConsentFormData(): FormData {
  const formData = new FormData();
  formData.set('client_id', 'claude-ai');
  formData.set('redirect_uri', 'https://claude.ai/api/mcp/auth_callback');
  formData.set('code_challenge', 'a'.repeat(43));
  formData.set('scope', 'read:entries');
  formData.set('state', 'state-1');
  formData.set('resource', 'https://mcp.dayopt.app');
  formData.set('decision', 'approve');
  return formData;
}

describe('processConsent database identity gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    validateAuthorizeInput.mockReturnValue({
      ok: true,
      client: { id: 'claude-ai' },
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      codeChallenge: 'a'.repeat(43),
      scopes: ['read:entries'],
      state: 'state-1',
      resourceUri: 'https://mcp.dayopt.app',
    });
    assertTokenIssuanceDatabaseIdentity.mockResolvedValue(undefined);
    grantRpc.mockResolvedValue({ error: null });
  });

  it('DB identity不一致ならgrant RPCへ到達せずserver_errorでredirectする', async () => {
    assertTokenIssuanceDatabaseIdentity.mockRejectedValue(
      new Error('OAuth token issuance is unavailable'),
    );

    await expect(processConsent(createConsentFormData())).rejects.toBeInstanceOf(RedirectSignal);

    expect(grantRpc).not.toHaveBeenCalled();
    const redirectedTo = new URL(redirect.mock.calls.at(-1)![0]);
    expect(redirectedTo.searchParams.get('error')).toBe('server_error');
    expect(redirectedTo.searchParams.get('code')).toBeNull();
    expect(redirectedTo.searchParams.get('state')).toBe('state-1');
  });

  it('DB identity一致ならgrant RPCの前に検証してからcodeを返す', async () => {
    await expect(processConsent(createConsentFormData())).rejects.toBeInstanceOf(RedirectSignal);

    expect(assertTokenIssuanceDatabaseIdentity).toHaveBeenCalledTimes(1);
    expect(grantRpc).toHaveBeenCalledTimes(1);
    expect(assertTokenIssuanceDatabaseIdentity.mock.invocationCallOrder[0]!).toBeLessThan(
      grantRpc.mock.invocationCallOrder[0]!,
    );
    expect(grantRpc).toHaveBeenCalledWith(
      'create_oauth_authorization_grant_v2',
      expect.objectContaining({ p_code_hash: 'issued-code-hash', p_user_id: 'user-1' }),
    );
    const redirectedTo = new URL(redirect.mock.calls.at(-1)![0]);
    expect(redirectedTo.searchParams.get('code')).toBe('issued-code');
    expect(redirectedTo.searchParams.get('error')).toBeNull();
  });
});
