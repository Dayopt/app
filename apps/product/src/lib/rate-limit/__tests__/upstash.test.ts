import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureUnexpectedError: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn() },
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: mocks.captureUnexpectedError,
}));

import {
  calendarConnectRateLimit,
  calendarSyncNowRateLimit,
  claimResendWebhookEvent,
  completeResendWebhookEvent,
  contactGlobalRateLimit,
  contactRateLimit,
  cspReportGlobalRateLimit,
  cspReportRateLimit,
  hashRateLimitIdentifier,
  icalFeedRateLimit,
  isUpstashEnabled,
  loginRateLimit,
  mcpPreAuthRateLimit,
  mcpUserRateLimit,
  oauthTokenGlobalRateLimit,
  oauthTokenIpRateLimit,
  passwordResetRateLimit,
  RATE_LIMIT_PRESETS,
  RATE_LIMIT_TIMEOUT_MS,
  RateLimitUnavailableError,
  releaseResendWebhookEvent,
  requireAvailableRateLimitResult,
  RESEND_WEBHOOK_PROCESSED_SECONDS,
  timeblockCreateRateLimit,
  trpcUserRateLimit,
  UPSTASH_COST_ESTIMATE,
  withUpstashRateLimit,
} from '../upstash';

const allowedResult = {
  success: true,
  limit: 5,
  remaining: 4,
  reset: 10_000,
  pending: Promise.resolve(),
  reason: undefined,
};

describe('Upstash Rate Limit', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock('@upstash/ratelimit');
    vi.doUnmock('@upstash/redis');
    vi.doUnmock('@/env');
    vi.unstubAllEnvs();
  });

  it('keeps local/test limiters disabled when credentials are absent', () => {
    expect(isUpstashEnabled).toBe(false);
    expect(loginRateLimit).toBeNull();
    expect(passwordResetRateLimit).toBeNull();
    expect(contactRateLimit).toBeNull();
    expect(contactGlobalRateLimit).toBeNull();
    expect(trpcUserRateLimit).toBeNull();
    expect(mcpPreAuthRateLimit).toBeNull();
    expect(mcpUserRateLimit).toBeNull();
    expect(oauthTokenIpRateLimit).toBeNull();
    expect(oauthTokenGlobalRateLimit).toBeNull();
    expect(timeblockCreateRateLimit).toBeNull();
    expect(icalFeedRateLimit).toBeNull();
    expect(calendarConnectRateLimit).toBeNull();
    expect(calendarSyncNowRateLimit).toBeNull();
    expect(cspReportRateLimit).toBeNull();
    expect(cspReportGlobalRateLimit).toBeNull();
  });

  it('hashes identifiers deterministically without retaining raw IP or user IDs', async () => {
    const rawIdentifier = 'ip:203.0.113.10';
    const first = await hashRateLimitIdentifier(rawIdentifier);
    const second = await hashRateLimitIdentifier(rawIdentifier);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toContain(rawIdentifier);
    expect(await hashRateLimitIdentifier('user-123')).not.toBe(first);
  });

  it('converts the SDK fail-open timeout result into backend unavailable', () => {
    expect(() =>
      requireAvailableRateLimitResult({ ...allowedResult, reason: 'timeout' } as never),
    ).toThrow(RateLimitUnavailableError);
    expect(requireAvailableRateLimitResult(allowedResult as never)).toBe(allowedResult);
  });

  it('uses local webhook leases outside Production and fails closed without Redis in Production', async () => {
    const claim = await claimResendWebhookEvent('event-1');
    expect(claim).toMatchObject({ status: 'claimed' });
    if (claim.status !== 'claimed') throw new Error('Expected a local claim');
    await expect(completeResendWebhookEvent('event-1', claim.token)).resolves.toBeUndefined();
    await expect(releaseResendWebhookEvent('event-1', claim.token)).resolves.toBeUndefined();

    vi.stubEnv('VERCEL_ENV', 'production');
    await expect(claimResendWebhookEvent('event-2')).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    );
  });

  it('distinguishes disabled, checked, and unavailable checks and captures the original error once', async () => {
    const request = new Request('https://app.dayopt.app/api/auth', {
      headers: { 'x-real-ip': '203.0.113.10' },
    });
    await expect(withUpstashRateLimit(request, null)).resolves.toEqual({ state: 'disabled' });

    const allowedLimiter = { limit: vi.fn().mockResolvedValue(allowedResult) };
    await expect(withUpstashRateLimit(request, allowedLimiter)).resolves.toEqual({
      state: 'checked',
      success: true,
      limit: 5,
      remaining: 4,
      reset: 10_000,
      pending: allowedResult.pending,
    });

    const backendError = new Error('redis unavailable');
    const unavailableLimiter = { limit: vi.fn().mockRejectedValue(backendError) };
    await expect(withUpstashRateLimit(request, unavailableLimiter)).resolves.toEqual({
      state: 'unavailable',
    });
    expect(mocks.captureUnexpectedError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedError).toHaveBeenCalledWith(backendError, {
      feature: 'rate_limit',
      operation: 'upstash_rate_limit_check',
      source: 'upstash',
    });
  });

  it('constructs every enabled limiter with no analytics, a 2 second timeout, and hashed keys', async () => {
    vi.resetModules();
    const constructorOptions: Array<Record<string, unknown>> = [];
    const limit = vi.fn().mockResolvedValue(allowedResult);

    class MockRatelimit {
      static slidingWindow(requests: number, window: string) {
        return { requests, window };
      }

      constructor(options: Record<string, unknown>) {
        constructorOptions.push(options);
      }

      limit = limit;
    }

    vi.doMock('@upstash/ratelimit', () => ({ Ratelimit: MockRatelimit }));
    vi.doMock('@upstash/redis', () => ({ Redis: class MockRedis {} }));
    vi.doMock('@/env', () => ({
      env: {
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'configured',
      },
    }));

    const enabledModule = await import('../upstash');
    expect(constructorOptions.map(({ prefix }) => prefix)).toEqual([
      'ratelimit:product:login',
      'ratelimit:product:password-reset',
      'ratelimit:product:contact',
      'ratelimit:product:contact-global',
      'ratelimit:product:trpc:user',
      'ratelimit:product:mcp:pre-auth',
      'ratelimit:product:mcp:user',
      'ratelimit:product:oauth-token:ip',
      'ratelimit:product:oauth-token:global',
      'ratelimit:product:timeblock:create',
      'ratelimit:product:ical-feed',
      'ratelimit:product:calendar-connect',
      'ratelimit:product:calendar-sync-now',
      'ratelimit:product:csp-report',
      'ratelimit:product:csp-report-global',
    ]);
    for (const options of constructorOptions) {
      expect(options.analytics).toBe(false);
      expect(options.timeout).toBe(RATE_LIMIT_TIMEOUT_MS);
      expect(options.prefix).toMatch(/^ratelimit:product:/u);
    }

    await enabledModule.loginRateLimit?.limit('ip:203.0.113.10');
    const persistedIdentifier = limit.mock.calls.at(-1)?.[0];
    expect(persistedIdentifier).toMatch(/^[a-f0-9]{64}$/u);
    expect(persistedIdentifier).not.toContain('203.0.113.10');
  });

  it('keeps documented presets and cost constants stable', () => {
    expect(RATE_LIMIT_PRESETS.api.requests).toBe(60);
    expect(RATE_LIMIT_PRESETS.auth.requests).toBe(5);
    expect(RATE_LIMIT_PRESETS.passwordReset.requests).toBe(3);
    expect(RATE_LIMIT_PRESETS.search.requests).toBe(30);
    expect(RATE_LIMIT_PRESETS.upload.requests).toBe(10);
    expect(UPSTASH_COST_ESTIMATE.estimatedMonthlyCost).toBe(6);
    expect(RESEND_WEBHOOK_PROCESSED_SECONDS).toBe(35 * 24 * 60 * 60);
  });
});
