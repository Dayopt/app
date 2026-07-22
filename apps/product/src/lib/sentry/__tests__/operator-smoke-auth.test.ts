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

  it('accepts an empty POST normalized by the runtime to Content-Length 0', async () => {
    const normalizedRequest = new Request(
      'https://app.dayopt.app/api/v1/system/sentry-smoke/server',
      {
        method: 'POST',
        body: '',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Length': '0',
          Origin: 'https://app.dayopt.app',
          'Sec-Fetch-Site': 'same-origin',
        },
      },
    );
    expect(normalizedRequest.body).not.toBeNull();

    const result = await authorizeProductOperatorSmoke(normalizedRequest, {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result).toEqual({ authorized: true });
    expect(normalizedRequest.bodyUsed).toBe(false);
  });

  it('accepts an empty POST stream after the Node runtime removes Content-Length 0', async () => {
    const normalizedRequest = new Request(
      'https://app.dayopt.app/api/v1/system/sentry-smoke/server',
      {
        method: 'POST',
        body: '',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://app.dayopt.app',
          'Sec-Fetch-Site': 'same-origin',
        },
      },
    );
    expect(normalizedRequest.body).not.toBeNull();
    expect(normalizedRequest.headers.has('content-length')).toBe(false);

    const result = await authorizeProductOperatorSmoke(normalizedRequest, {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result).toEqual({ authorized: true });
    expect(normalizedRequest.bodyUsed).toBe(false);
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

  it.each([
    ['without a framing header', {}],
    ['despite Content-Length 0', { 'Content-Length': '0' }],
  ])('rejects a non-empty body %s after token verification', async (_label, headers) => {
    const result = await authorizeProductOperatorSmoke(
      new Request('https://app.dayopt.app/api/v1/system/sentry-smoke/server', {
        method: 'POST',
        body: '{}',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://app.dayopt.app',
          'Sec-Fetch-Site': 'same-origin',
          ...headers,
        },
      }),
      { env: activeEnvironment(), now: NOW, checkRateLimit },
    );

    expect(result.authorized).toBe(false);
    expect(checkRateLimit.mock.calls.map(([stage]) => stage)).toEqual(['per-ip', 'global']);
  });

  it('applies global limiting before reading one non-empty chunk and cancels the clone', async () => {
    const events: string[] = [];
    const read = vi.fn(async () => {
      events.push('read');
      return { done: false, value: new Uint8Array([1]) };
    });
    const cancel = vi.fn(async () => undefined);
    const smokeRequest = request();
    vi.spyOn(smokeRequest, 'clone').mockImplementation(() => {
      events.push('clone');
      return { body: { getReader: () => ({ read, cancel }) } } as never;
    });

    const result = await authorizeProductOperatorSmoke(smokeRequest, {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit: async (stage) => {
        events.push(stage);
        return 'allowed';
      },
    });

    expect(result.authorized).toBe(false);
    expect(events).toEqual(['per-ip', 'global', 'clone', 'read']);
    expect(read).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('fails closed and cancels the cloned stream when the body probe times out', async () => {
    vi.useFakeTimers();
    try {
      let markReadStarted: (() => void) | undefined;
      const readStarted = new Promise<void>((resolve) => {
        markReadStarted = resolve;
      });
      const read = vi.fn(() => {
        markReadStarted?.();
        return new Promise<never>(() => undefined);
      });
      const cancel = vi.fn(async () => undefined);
      const smokeRequest = request();
      vi.spyOn(smokeRequest, 'clone').mockReturnValue({
        body: { getReader: () => ({ read, cancel }) },
      } as never);

      const resultPromise = authorizeProductOperatorSmoke(smokeRequest, {
        env: activeEnvironment(),
        now: NOW,
        checkRateLimit,
      });
      await readStarted;
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(result.authorized).toBe(false);
      if (!result.authorized) expect(result.response.status).toBe(404);
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['positive content length', { 'Content-Length': '2' }],
    ['streamed transfer', { 'Transfer-Encoding': 'chunked' }],
  ])('rejects %s before rate limiting', async (_label, headers) => {
    const result = await authorizeProductOperatorSmoke(
      new Request('https://app.dayopt.app/api/v1/system/sentry-smoke/server', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://app.dayopt.app',
          'Sec-Fetch-Site': 'same-origin',
          ...headers,
        },
      }),
      { env: activeEnvironment(), now: NOW, checkRateLimit },
    );

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('counts and rejects an invalid token without returning it', async () => {
    const invalidToken = 'B'.repeat(43);
    const invalidRequest = request(invalidToken);
    const cloneSpy = vi.spyOn(invalidRequest, 'clone');
    const result = await authorizeProductOperatorSmoke(invalidRequest, {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).toHaveBeenCalledOnce();
    expect(checkRateLimit).toHaveBeenCalledWith('per-ip', expect.any(Request), expect.any(Object));
    expect(cloneSpy).not.toHaveBeenCalled();
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
