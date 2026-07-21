import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rateLimit = vi.hoisted(() => ({
  cspReportGlobalRateLimit: { limit: vi.fn() },
  cspReportRateLimit: { limit: vi.fn() },
  getClientIp: vi.fn(() => '203.0.113.10'),
  hashRateLimitIdentifier: vi.fn(async () => 'hashed-client-ip'),
}));

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));
vi.mock('@web/platform/security/rate-limit', () => rateLimit);

import { HEAD, POST } from './route';

const validReport = {
  'csp-report': {
    'document-uri': 'https://dayopt.app/docs?private=1#section',
    'violated-directive': 'script-src-elem https://example.com',
    'effective-directive': 'script-src-elem',
    'original-policy': "default-src 'self'",
    'blocked-uri': 'https://cdn.example.com/client.js?token=secret',
    'status-code': 200,
    'source-file': 'https://dayopt.app/_next/app.js?build=secret',
    'line-number': 12,
    'column-number': 4,
  },
};

function createRequest(body: string, headers: HeadersInit = {}): NextRequest {
  return new NextRequest('https://dayopt.app/api/csp-report', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/csp-report', ...headers },
  });
}

function createStreamingRequest(chunks: Uint8Array[], onCancel: () => void): NextRequest {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      onCancel();
    },
  });
  type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
  const init = {
    method: 'POST',
    body,
    duplex: 'half',
    headers: { 'content-type': 'application/csp-report' },
  } satisfies NextRequestInit & { duplex: 'half' };
  return new NextRequest('https://dayopt.app/api/csp-report', init);
}

describe('/api/csp-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.cspReportRateLimit.limit.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60_000,
    });
    rateLimit.cspReportGlobalRateLimit.limit.mockResolvedValue({
      success: true,
      limit: 120,
      remaining: 119,
      reset: Date.now() + 60_000,
    });
  });

  it('strips URL queries, groups by directive, and rate-limits by IP hash', async () => {
    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(200);
    expect(rateLimit.cspReportRateLimit.limit).toHaveBeenCalledWith('hashed-client-ip');
    expect(rateLimit.cspReportGlobalRateLimit.limit).toHaveBeenCalledWith('all-clients');
    expect(Sentry.captureMessage).toHaveBeenCalledWith('CSP Violation: script-src-elem', {
      level: 'warning',
      fingerprint: ['csp-violation', 'script-src-elem'],
      tags: { type: 'csp-violation', directive: 'script-src-elem' },
      contexts: {
        csp: {
          documentUri: 'https://dayopt.app/docs',
          blockedUri: 'https://cdn.example.com/client.js',
          effectiveDirective: 'script-src-elem',
          sourceFile: 'https://dayopt.app/_next/app.js',
          lineNumber: 12,
        },
      },
    });
  });

  it('accepts browser-extension noise without sending it to Sentry', async () => {
    const report = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'blocked-uri': 'chrome-extension://extension-id/script.js?secret=1',
      },
    };

    expect((await POST(createRequest(JSON.stringify(report)))).status).toBe(200);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('maps arbitrary directives to one fixed unknown group', async () => {
    const report = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'violated-directive': 'attacker-controlled-directive-123',
      },
    };

    expect((await POST(createRequest(JSON.stringify(report)))).status).toBe(200);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'CSP Violation: unknown',
      expect.objectContaining({ fingerprint: ['csp-violation', 'unknown'] }),
    );
  });

  it('rejects simple cross-origin content types before rate limiting or body parsing', async () => {
    const response = await POST(
      createRequest(JSON.stringify(validReport), { 'content-type': 'text/plain' }),
    );

    expect(response.status).toBe(415);
    expect(rateLimit.cspReportRateLimit.limit).not.toHaveBeenCalled();
    expect(rateLimit.cspReportGlobalRateLimit.limit).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects reports whose document URI is not the canonical Website origin', async () => {
    const report = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'document-uri': 'https://attacker.example/private?secret=1',
      },
    };

    expect((await POST(createRequest(JSON.stringify(report)))).status).toBe(400);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['{invalid-json', 400],
    [JSON.stringify({ 'csp-report': {} }), 400],
  ])('rejects malformed input without capture', async (body, status) => {
    expect((await POST(createRequest(body))).status).toBe(status);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects an oversized report before parsing it', async () => {
    const request = createRequest(JSON.stringify(validReport), {
      'content-length': String(16 * 1024 + 1),
    });

    expect((await POST(request)).status).toBe(413);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('cancels a chunked body as soon as the byte limit is exceeded', async () => {
    const onCancel = vi.fn();
    const request = createStreamingRequest(
      [new Uint8Array(10 * 1024), new Uint8Array(7 * 1024), new Uint8Array(1024)],
      onCancel,
    );

    expect((await POST(request)).status).toBe(413);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('returns 429 without reading or capturing the report', async () => {
    rateLimit.cspReportRateLimit.limit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 10_000,
    });

    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(rateLimit.cspReportGlobalRateLimit.limit).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('applies an aggregate cap after the per-client limit passes', async () => {
    rateLimit.cspReportGlobalRateLimit.limit.mockResolvedValueOnce({
      success: false,
      limit: 120,
      remaining: 0,
      reset: Date.now() + 10_000,
    });

    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('fails closed when the rate-limit backend is unavailable or times out', async () => {
    rateLimit.cspReportRateLimit.limit.mockRejectedValueOnce(new Error('rate limit unavailable'));

    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('responds to HEAD requests', async () => {
    expect((await HEAD()).status).toBe(200);
  });
});
