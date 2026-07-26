import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const exchangeAuthorizationCode = vi.hoisted(() => vi.fn());
const refreshAccessToken = vi.hoisted(() => vi.fn());

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

import { POST } from '../route';

describe('OAuth token route host boundary', () => {
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
    expect(exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
