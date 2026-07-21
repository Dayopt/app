import { describe, expect, it } from 'vitest';

import {
  getClientIp,
  hashRateLimitIdentifier,
  RateLimitUnavailableError,
  requireAvailableRateLimitResult,
} from './rate-limit';

function result(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    limit: 3,
    remaining: 2,
    reset: Date.now() + 60_000,
    pending: Promise.resolve(),
    ...overrides,
  };
}

describe('Web rate-limit privacy and availability contract', () => {
  it('hashes raw IP identifiers before they reach Upstash', async () => {
    const rawIp = '203.0.113.10';

    const first = await hashRateLimitIdentifier(rawIp);
    const second = await hashRateLimitIdentifier(rawIp);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toContain(rawIp);
  });

  it('prefers the Vercel-controlled forwarded IP header', () => {
    const request = new Request('https://dayopt.app', {
      headers: {
        'x-vercel-forwarded-for': '203.0.113.10',
        'x-forwarded-for': '198.51.100.20',
      },
    });
    expect(getClientIp(request)).toBe('203.0.113.10');
  });

  it('rejects the SDK fail-open timeout response', () => {
    expect(() =>
      requireAvailableRateLimitResult(
        result({ success: true, remaining: 0, reason: 'timeout' }) as never,
      ),
    ).toThrow(RateLimitUnavailableError);
  });

  it('preserves Redis-backed allowed and limited results', () => {
    const allowed = result();
    const limited = result({ success: false, remaining: 0 });

    expect(requireAvailableRateLimitResult(allowed as never)).toBe(allowed);
    expect(requireAvailableRateLimitResult(limited as never)).toBe(limited);
  });
});
