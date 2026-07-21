import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

const createOAuthDbClient = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());

vi.mock('../db', () => ({ createOAuthDbClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError }));

import { exchangeAuthorizationCode } from '../code-exchange';
import { OAuthServerError } from '../errors';

describe('exchangeAuthorizationCode observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  it('DB障害は元cause付きserver_errorとして一度captureする', async () => {
    const dbError = { message: 'database unavailable', code: 'PGRST000' };
    createOAuthDbClient.mockReturnValue({ from: vi.fn(() => createChainableMock(null, dbError)) });

    const promise = exchangeAuthorizationCode({
      code: 'opaque-code',
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      code_verifier: 'verifier',
    });

    await expect(promise).rejects.toMatchObject({
      name: 'OAuthServerError',
      code: 'server_error',
      httpStatus: 500,
      message: 'Authorization code exchange failed',
      cause: expect.any(Error),
    });
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
      feature: 'oauth',
      operation: 'consume_authorization_code',
    });
  });

  it('期限切れcodeはexpected invalid_grantでcaptureしない', async () => {
    createOAuthDbClient.mockReturnValue({ from: vi.fn(() => createChainableMock([])) });

    await expect(
      exchangeAuthorizationCode({
        code: 'expired-code',
        client_id: 'chatgpt',
        redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        code_verifier: 'verifier',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<OAuthServerError>>({
        code: 'invalid_grant',
        httpStatus: 400,
      }),
    );
    expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });
});
