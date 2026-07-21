// @vitest-environment node

import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeProductOperatorSmoke,
  classifyOperatorSmokeRateLimitResult,
} from '../operator-smoke-auth';

const NOW = Date.parse('2026-07-22T01:00:00.000Z');
const TOKEN = 'A'.repeat(43);
const TOKEN_DIGEST = createHash('sha256').update(TOKEN).digest('hex');

function activeEnvironment(): Record<string, string> {
  return {
    VERCEL_ENV: 'production',
    SENTRY_OPERATOR_SMOKE_ENABLED: 'true',
    SENTRY_OPERATOR_SMOKE_TOKEN_SHA256: TOKEN_DIGEST,
    SENTRY_OPERATOR_SMOKE_EXPIRES_AT: new Date(NOW + 60 * 60 * 1_000).toISOString(),
  };
}

function request(token = TOKEN, origin = 'https://app.dayopt.app'): Request {
  return new Request('https://app.dayopt.app/api/v1/system/sentry-smoke/server', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      'Sec-Fetch-Site': 'same-origin',
      'X-Forwarded-For': '203.0.113.9',
    },
  });
}

describe('authorizeProductOperatorSmoke', () => {
  const checkRateLimit = vi.fn(
    async (
      _stage: 'per-ip' | 'global',
      _request: Request,
      _env: Record<string, string | undefined>,
    ) => 'allowed' as const,
  );

  beforeEach(() => vi.clearAllMocks());

  it('treats the Upstash SDK fail-open timeout result as unavailable', () => {
    expect(classifyOperatorSmokeRateLimitResult({ success: true, reason: 'timeout' })).toBe(
      'unavailable',
    );
    expect(classifyOperatorSmokeRateLimitResult({ success: true })).toBe('allowed');
    expect(classifyOperatorSmokeRateLimitResult({ success: false })).toBe('limited');
  });

  it('authorizes a same-origin Production request with a matching digest', async () => {
    const result = await authorizeProductOperatorSmoke(request(), {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result).toEqual({ authorized: true });
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(checkRateLimit.mock.calls.map(([stage]) => stage)).toEqual(['per-ip', 'global']);
  });

  it.each([
    ['preview', { VERCEL_ENV: 'preview' }],
    ['disabled', { SENTRY_OPERATOR_SMOKE_ENABLED: 'false' }],
    ['expired', { SENTRY_OPERATOR_SMOKE_EXPIRES_AT: new Date(NOW).toISOString() }],
    ['past immutable deadline', { SENTRY_OPERATOR_SMOKE_EXPIRES_AT: '2026-07-22T12:00:00.001Z' }],
  ])('fails closed when configuration is %s', async (_label, override) => {
    const result = await authorizeProductOperatorSmoke(request(), {
      env: { ...activeEnvironment(), ...override },
      now: NOW,
      checkRateLimit,
    });

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(404);
      expect(await result.response.text()).toBe('');
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request before rate limiting', async () => {
    const result = await authorizeProductOperatorSmoke(request(TOKEN, 'https://attacker.example'), {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('never re-enables an expiry beyond the immutable deadline as time advances', async () => {
    const result = await authorizeProductOperatorSmoke(request(), {
      env: {
        ...activeEnvironment(),
        SENTRY_OPERATOR_SMOKE_EXPIRES_AT: '2026-07-22T12:00:00.001Z',
      },
      now: Date.parse('2026-07-22T11:30:00.000Z'),
      checkRateLimit,
    });

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ['at', Date.parse('2026-07-22T12:00:00.000Z')],
    ['after', Date.parse('2026-07-22T12:00:00.001Z')],
  ])('fails closed %s the immutable deadline', async (_label, now) => {
    const result = await authorizeProductOperatorSmoke(request(), {
      env: {
        ...activeEnvironment(),
        SENTRY_OPERATOR_SMOKE_EXPIRES_AT: '2026-07-22T12:00:00.000Z',
      },
      now,
      checkRateLimit,
    });

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('rejects any request body before rate limiting', async () => {
    const result = await authorizeProductOperatorSmoke(
      new Request('https://app.dayopt.app/api/v1/system/sentry-smoke/server', {
        method: 'POST',
        body: '{}',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://app.dayopt.app',
          'Sec-Fetch-Site': 'same-origin',
        },
      }),
      { env: activeEnvironment(), now: NOW, checkRateLimit },
    );

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('counts and rejects an invalid token without returning it', async () => {
    const invalidToken = 'B'.repeat(43);
    const result = await authorizeProductOperatorSmoke(request(invalidToken), {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).toHaveBeenCalledOnce();
    expect(checkRateLimit).toHaveBeenCalledWith('per-ip', expect.any(Request), expect.any(Object));
    if (!result.authorized) {
      expect(result.response.status).toBe(404);
      expect(result.response.headers.get('cache-control')).toContain('no-store');
      expect(await result.response.text()).not.toContain(invalidToken);
    }
  });

  it.each([
    ['limited', 429],
    ['unavailable', 503],
  ] as const)('fails closed when rate limiting is %s', async (status, expectedStatus) => {
    const result = await authorizeProductOperatorSmoke(request(), {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit: async () => status,
    });

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(expectedStatus);
      expect(result.response.headers.get('retry-after')).toBe(
        expectedStatus === 429 ? '3600' : null,
      );
    }
  });
});
