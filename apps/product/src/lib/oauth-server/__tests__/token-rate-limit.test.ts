import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ipLimit = vi.hoisted(() => vi.fn());
const globalLimit = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit/upstash', () => ({
  oauthTokenIpRateLimit: { limit: ipLimit },
  oauthTokenGlobalRateLimit: { limit: globalLimit },
}));
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError } }));

import {
  checkOAuthTokenRateLimit,
  requiresDistributedOAuthTokenRateLimit,
} from '../token-rate-limit';

describe('OAuth token endpoint rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipLimit.mockResolvedValue({ success: true });
    globalLimit.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('checks validated client IP before the global budget', async () => {
    const request = new Request('https://app.dayopt.app/api/oauth/token', {
      headers: { 'x-real-ip': '203.0.113.10' },
    });

    await expect(checkOAuthTokenRateLimit(request)).resolves.toBe('allowed');
    expect(ipLimit).toHaveBeenCalledWith('ip:203.0.113.10');
    expect(globalLimit).toHaveBeenCalledWith('all-clients');
    expect(ipLimit.mock.invocationCallOrder[0]).toBeLessThan(
      globalLimit.mock.invocationCallOrder[0]!,
    );
  });

  it('stops before the global budget when the IP budget is exhausted', async () => {
    ipLimit.mockResolvedValueOnce({ success: false });

    await expect(
      checkOAuthTokenRateLimit(
        new Request('https://app.dayopt.app/api/oauth/token', {
          headers: { 'x-real-ip': '203.0.113.10' },
        }),
      ),
    ).resolves.toBe('limited');
    expect(globalLimit).not.toHaveBeenCalled();
  });

  it('returns limited when the global budget is exhausted', async () => {
    globalLimit.mockResolvedValueOnce({ success: false });

    await expect(
      checkOAuthTokenRateLimit(
        new Request('https://app.dayopt.app/api/oauth/token', {
          headers: { 'x-real-ip': '203.0.113.10' },
        }),
      ),
    ).resolves.toBe('limited');
    expect(ipLimit).toHaveBeenCalledOnce();
    expect(globalLimit).toHaveBeenCalledOnce();
  });

  it('fails closed without logging the client identifier when Redis is unavailable', async () => {
    ipLimit.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(
      checkOAuthTokenRateLimit(
        new Request('https://app.dayopt.app/api/oauth/token', {
          headers: { 'x-real-ip': '203.0.113.10' },
        }),
      ),
    ).resolves.toBe('unavailable');
    expect(captureUnexpectedError).toHaveBeenCalledOnce();
    expect(loggerError).toHaveBeenCalledWith('OAuth token rate limit check failed');
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain('203.0.113.10');
  });

  it('fails closed when the global limiter is unavailable', async () => {
    globalLimit.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(
      checkOAuthTokenRateLimit(
        new Request('https://app.dayopt.app/api/oauth/token', {
          headers: { 'x-real-ip': '203.0.113.10' },
        }),
      ),
    ).resolves.toBe('unavailable');
    expect(captureUnexpectedError).toHaveBeenCalledOnce();
    expect(loggerError).toHaveBeenCalledWith('OAuth token rate limit check failed');
  });

  it('requires distributed limits for Production and OAuth-enabled Preview', () => {
    expect(requiresDistributedOAuthTokenRateLimit({ VERCEL_ENV: 'production' })).toBe(true);
    expect(
      requiresDistributedOAuthTokenRateLimit({
        VERCEL_ENV: 'preview',
        VERCEL_TARGET_ENV: 'staging',
      }),
    ).toBe(true);
    expect(
      requiresDistributedOAuthTokenRateLimit({
        VERCEL_ENV: 'preview',
        VERCEL_TARGET_ENV: 'preview',
        MCP_OAUTH_ENVIRONMENT: 'preview',
      }),
    ).toBe(true);
    expect(requiresDistributedOAuthTokenRateLimit({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(requiresDistributedOAuthTokenRateLimit({})).toBe(false);
  });
});
