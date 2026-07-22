// @vitest-environment node

import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { authorizeWebOperatorSmoke } from './operator-smoke-auth';

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

function request(token = TOKEN, origin = 'https://dayopt.app'): Request {
  return new Request('https://dayopt.app/api/v1/system/sentry-smoke/server', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      'Sec-Fetch-Site': 'same-origin',
      'X-Forwarded-For': '203.0.113.9',
    },
  });
}

describe('authorizeWebOperatorSmoke', () => {
  const checkRateLimit = vi.fn(async () => 'allowed' as const);

  beforeEach(() => vi.clearAllMocks());

  it('authorizes a same-origin Production request with a matching digest', async () => {
    const result = await authorizeWebOperatorSmoke(request(), {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result).toEqual({ authorized: true });
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(checkRateLimit.mock.calls.map(([stage]) => stage)).toEqual(['per-ip', 'global']);
  });

  it('accepts an empty POST normalized by the runtime to Content-Length 0', async () => {
    const normalizedRequest = new Request('https://dayopt.app/api/v1/system/sentry-smoke/server', {
      method: 'POST',
      body: '',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Length': '0',
        Origin: 'https://dayopt.app',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect(normalizedRequest.body).not.toBeNull();

    const result = await authorizeWebOperatorSmoke(normalizedRequest, {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });

    expect(result).toEqual({ authorized: true });
  });

  it.each([
    ['preview', { VERCEL_ENV: 'preview' }],
    ['disabled', { SENTRY_OPERATOR_SMOKE_ENABLED: 'false' }],
    ['expired', { SENTRY_OPERATOR_SMOKE_EXPIRES_AT: new Date(NOW).toISOString() }],
    ['past immutable deadline', { SENTRY_OPERATOR_SMOKE_EXPIRES_AT: '2026-07-22T12:00:00.001Z' }],
  ])('fails closed when configuration is %s', async (_label, override) => {
    const result = await authorizeWebOperatorSmoke(request(), {
      env: { ...activeEnvironment(), ...override },
      now: NOW,
      checkRateLimit,
    });

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.response.status).toBe(404);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('rejects cross-origin and body-bearing requests before rate limiting', async () => {
    const crossOrigin = await authorizeWebOperatorSmoke(
      request(TOKEN, 'https://attacker.example'),
      { env: activeEnvironment(), now: NOW, checkRateLimit },
    );
    const bodyBearing = await authorizeWebOperatorSmoke(
      new Request('https://dayopt.app/api/v1/system/sentry-smoke/server', {
        method: 'POST',
        body: '{}',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://dayopt.app',
          'Sec-Fetch-Site': 'same-origin',
        },
      }),
      { env: activeEnvironment(), now: NOW, checkRateLimit },
    );

    expect(crossOrigin.authorized).toBe(false);
    expect(bodyBearing.authorized).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ['positive content length', { 'Content-Length': '2' }],
    ['streamed transfer', { 'Transfer-Encoding': 'chunked' }],
  ])('rejects %s before rate limiting', async (_label, headers) => {
    const result = await authorizeWebOperatorSmoke(
      new Request('https://dayopt.app/api/v1/system/sentry-smoke/server', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://dayopt.app',
          'Sec-Fetch-Site': 'same-origin',
          ...headers,
        },
      }),
      { env: activeEnvironment(), now: NOW, checkRateLimit },
    );

    expect(result.authorized).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ['at', Date.parse('2026-07-22T12:00:00.000Z')],
    ['after', Date.parse('2026-07-22T12:00:00.001Z')],
  ])('fails closed %s the immutable deadline', async (_label, now) => {
    const result = await authorizeWebOperatorSmoke(request(), {
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

  it('counts an invalid token and fails closed when rate limiting is unavailable', async () => {
    const invalid = await authorizeWebOperatorSmoke(request('B'.repeat(43)), {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit,
    });
    expect(invalid.authorized).toBe(false);
    expect(checkRateLimit).toHaveBeenCalledOnce();

    const unavailable = await authorizeWebOperatorSmoke(request(), {
      env: activeEnvironment(),
      now: NOW,
      checkRateLimit: async () => 'unavailable',
    });
    expect(unavailable.authorized).toBe(false);
    if (!unavailable.authorized) expect(unavailable.response.status).toBe(503);
  });
});
