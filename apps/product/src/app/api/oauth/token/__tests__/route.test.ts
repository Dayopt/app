import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeAuthorizationCode = vi.hoisted(() => vi.fn());
const refreshAccessToken = vi.hoisted(() => vi.fn());
const checkOAuthTokenRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/oauth-server', () => ({
  OAuthServerError: class OAuthServerError extends Error {},
  exchangeAuthorizationCode,
  refreshAccessToken,
  resolveClient: vi.fn(),
  resolveRequestedResource: vi.fn(),
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));
vi.mock('@/lib/oauth-server/token-rate-limit', () => ({
  checkOAuthTokenRateLimit,
}));

import { POST } from '../route';

describe('OAuth token route host boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkOAuthTokenRateLimit.mockResolvedValue('allowed');
  });

  it.each([
    'https://mcp.dayopt.app/api/oauth/token',
    'https://mcp.dayopt.app/api/oauth/token/',
    'https://preview-product.vercel.app/api/oauth/token',
    'https://staging.dayopt.app/api/oauth/token',
  ])('rejects an inactive or foreign host before parsing or token issuance: %s', async (url) => {
    const response = await POST(
      new NextRequest(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=authorization_code',
      }),
    );

    expect(response.status).toBe(404);
    expect(checkOAuthTokenRateLimit).not.toHaveBeenCalled();
    expect(exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    ['limited', 429, 'temporarily_unavailable', '60'],
    ['unavailable', 503, 'server_error', '5'],
  ] as const)(
    'returns a fail-closed OAuth response before reading the body when rate limit state is %s',
    async (state, status, error, retryAfter) => {
      checkOAuthTokenRateLimit.mockResolvedValueOnce(state);
      const request = new NextRequest('https://app.dayopt.app/api/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=authorization_code',
      });
      const readBody = vi.spyOn(request, 'text');

      const response = await POST(request);

      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('retry-after')).toBe(retryAfter);
      expect(response.headers.get('www-authenticate')).toBeNull();
      await expect(response.json()).resolves.toMatchObject({ error });
      expect(readBody).not.toHaveBeenCalled();
      expect(exchangeAuthorizationCode).not.toHaveBeenCalled();
      expect(refreshAccessToken).not.toHaveBeenCalled();
    },
  );
});
