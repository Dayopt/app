import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
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

    await expect(hashRateLimitIdentifier(rawIp)).resolves.toBe(
      createHash('sha256').update(rawIp).digest('hex'),
    );
    await expect(hashRateLimitIdentifier(rawIp)).resolves.not.toContain(rawIp);
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
