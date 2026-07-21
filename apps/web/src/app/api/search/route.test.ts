import { beforeEach, describe, expect, it, vi } from 'vitest';

import fs from 'fs';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  captureUnexpectedWebError: vi.fn(),
  getClientIp: vi.fn(() => '203.0.113.10'),
  hashRateLimitIdentifier: vi.fn(async () => 'hashed-client-ip'),
  searchRateLimit: { limit: vi.fn() },
}));

vi.mock('@web/platform/observability/capture-unexpected-error', () => ({
  captureUnexpectedWebError: mocks.captureUnexpectedWebError,
}));
vi.mock('@web/platform/security/rate-limit', () => ({
  getClientIp: mocks.getClientIp,
  hashRateLimitIdentifier: mocks.hashRateLimitIdentifier,
  searchRateLimit: mocks.searchRateLimit,
}));

import { GET } from './route';

function request(query = 'term', headers: HeadersInit = {}): NextRequest {
  return new NextRequest(`https://dayopt.app/api/search?q=${encodeURIComponent(query)}&locale=en`, {
    headers,
  });
}

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captureUnexpectedWebError.mockImplementation((error: unknown) => error);
    mocks.searchRateLimit.limit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
    });
  });

  it('returns expected 429 and 400 outcomes without capture', async () => {
    mocks.searchRateLimit.limit.mockResolvedValueOnce({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    expect((await GET(request())).status).toBe(429);

    expect((await GET(request('x'.repeat(201)))).status).toBe(400);
    expect(mocks.captureUnexpectedWebError).not.toHaveBeenCalled();
    expect(mocks.searchRateLimit.limit).toHaveBeenCalledWith('hashed-client-ip');
  });

  it('captures the original rate-limit failure once and fails closed', async () => {
    const original = new Error('redis unavailable');
    mocks.searchRateLimit.limit.mockRejectedValueOnce(original);

    expect((await GET(request('term', { 'x-vercel-id': 'iad1::search-request-123' }))).status).toBe(
      503,
    );
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
      feature: 'search',
      operation: 'rate_limit',
      route: '/api/search',
      requestId: 'iad1::search-request-123',
    });
  });

  it('captures the original search-index failure once', async () => {
    const original = new Error('search index unavailable');
    const readFileSpy = vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw original;
    });

    try {
      expect((await GET(request())).status).toBe(500);
      expect(mocks.captureUnexpectedWebError).toHaveBeenCalledOnce();
      expect(mocks.captureUnexpectedWebError).toHaveBeenCalledWith(original, {
        feature: 'search',
        operation: 'search_request',
        route: '/api/search',
      });
    } finally {
      readFileSpy.mockRestore();
    }
  });
});
