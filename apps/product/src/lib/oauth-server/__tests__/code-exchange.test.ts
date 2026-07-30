import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createOAuthDbClient = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());

vi.mock('../db', () => ({ createOAuthDbClient }));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError }));

import { exchangeAuthorizationCode, refreshAccessToken } from '../code-exchange';
import { OAuthServerError } from '../errors';
import type { CanonicalResourceUri } from '../resource';

const resourceUri = 'https://mcp.dayopt.app' as CanonicalResourceUri;
const verifier = 'v'.repeat(43);

describe('connection-bound OAuth token exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T00:00:00.000Z'));
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exchanges a code through the atomic RPC and derives expires_in from DB time', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          access_expires_at: '2026-07-23T00:05:00.000Z',
          scopes: ['read:entries', 'write:plans'],
        },
      ],
      error: null,
    });
    createOAuthDbClient.mockReturnValue({ rpc });

    const result = await exchangeAuthorizationCode({
      code: 'opaque-code',
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      code_verifier: verifier,
      resource_uri: resourceUri,
    });

    expect(rpc).toHaveBeenCalledWith(
      'exchange_oauth_authorization_code_v2',
      expect.objectContaining({
        p_client_id: 'chatgpt',
        p_resource_uri: resourceUri,
        p_code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      }),
    );
    expect(result).toMatchObject({
      access_token: expect.stringMatching(/^dop_at_/),
      refresh_token: expect.stringMatching(/^dop_rt_/),
      token_type: 'Bearer',
      expires_in: 300,
      scope: 'read:entries write:plans',
    });
  });

  it('rejects malformed verifiers before consuming the code', async () => {
    const rpc = vi.fn();
    createOAuthDbClient.mockReturnValue({ rpc });

    await expect(
      exchangeAuthorizationCode({
        code: 'opaque-code',
        client_id: 'chatgpt',
        redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        code_verifier: 'short',
        resource_uri: resourceUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('captures a database failure once and preserves its cause', async () => {
    const dbError = { message: 'database unavailable', code: 'PGRST000' };
    createOAuthDbClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: dbError }),
    });

    const promise = exchangeAuthorizationCode({
      code: 'opaque-code',
      client_id: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      code_verifier: verifier,
      resource_uri: resourceUri,
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
      operation: 'exchange_authorization_code',
    });
  });

  it('maps an already consumed code to expected invalid_grant without capture', async () => {
    createOAuthDbClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    await expect(
      exchangeAuthorizationCode({
        code: 'consumed-code',
        client_id: 'chatgpt',
        redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        code_verifier: verifier,
        resource_uri: resourceUri,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<OAuthServerError>>({
        code: 'invalid_grant',
        httpStatus: 400,
      }),
    );
    expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it('does not turn a grace-window duplicate refresh into a token response', async () => {
    createOAuthDbClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ status: 'retryable_duplicate', access_expires_at: null, scopes: null }],
        error: null,
      }),
    });

    await expect(
      refreshAccessToken({
        refresh_token: 'dop_rt_previous',
        client_id: 'claude-ai',
        resource_uri: resourceUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });
});
