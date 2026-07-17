import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';
import { withUpstashRateLimit } from '@/lib/rate-limit/upstash';

import { HEAD, POST } from '../route';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const rateLimitMocks = vi.hoisted(() => ({ globalLimit: vi.fn() }));

vi.mock('@/lib/rate-limit/upstash', () => ({
  cspReportRateLimit: {},
  cspReportGlobalRateLimit: { limit: rateLimitMocks.globalLimit },
  withUpstashRateLimit: vi.fn(),
}));

const captureUnexpectedError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sentry', () => ({ captureUnexpectedError }));

const validReport = {
  'csp-report': {
    'document-uri': 'https://app.dayopt.app/calendar?private=1#today',
    'violated-directive': 'script-src-elem https://example.com',
    'effective-directive': 'script-src-elem',
    'original-policy': "default-src 'self'",
    'blocked-uri': 'https://cdn.example.com/client.js?token=secret',
    'status-code': 200,
    'source-file': 'https://app.dayopt.app/_next/app.js?build=secret',
    'line-number': 12,
    'column-number': 4,
  },
};

function createRequest(body: string, headers: HeadersInit = {}): NextRequest {
  return new NextRequest('https://app.dayopt.app/api/csp-report', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/csp-report',
      ...headers,
    },
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
  return new NextRequest('https://app.dayopt.app/api/csp-report', init);
}

describe('/api/csp-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withUpstashRateLimit).mockResolvedValue({
      state: 'checked',
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });
    rateLimitMocks.globalLimit.mockResolvedValue({
      success: true,
      limit: 120,
      remaining: 119,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });
  });

  it('accepts a valid report, strips URL queries, and groups by directive', async () => {
    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(Sentry.captureMessage).toHaveBeenCalledWith('CSP Violation: script-src-elem', {
      level: 'warning',
      fingerprint: ['csp-violation', 'script-src-elem'],
      tags: {
        type: 'csp-violation',
        directive: 'script-src-elem',
      },
      contexts: {
        csp: {
          documentUri: 'https://app.dayopt.app/calendar',
          blockedUri: 'https://cdn.example.com/client.js',
          effectiveDirective: 'script-src-elem',
          sourceFile: 'https://app.dayopt.app/_next/app.js',
          lineNumber: 12,
        },
      },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[CSP Violation]',
      expect.objectContaining({
        documentUri: 'https://app.dayopt.app/calendar',
        blockedUri: 'https://cdn.example.com/client.js',
      }),
    );
  });

  it('accepts extension violations without sending them to Sentry', async () => {
    const extensionReport = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'blocked-uri': 'chrome-extension://extension-id/script.js?secret=1',
      },
    };

    const response = await POST(createRequest(JSON.stringify(extensionReport)));

    expect(response.status).toBe(200);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[CSP Violation]',
      expect.objectContaining({ blockedUri: 'chrome-extension://[redacted]' }),
    );
  });

  it('rejects non-CSP content types before rate limiting or reading the body', async () => {
    const response = await POST(
      createRequest(JSON.stringify(validReport), { 'content-type': 'application/json' }),
    );

    expect(response.status).toBe(415);
    expect(withUpstashRateLimit).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects reports that claim a document outside the Product origin', async () => {
    const externalReport = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'document-uri': 'https://attacker.example/calendar',
      },
    };

    const response = await POST(createRequest(JSON.stringify(externalReport)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid report origin' });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('groups unrecognized directives into a fixed unknown bucket', async () => {
    const unknownDirectiveReport = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'violated-directive': 'attacker-controlled-directive-123',
      },
    };

    await POST(createRequest(JSON.stringify(unknownDirectiveReport)));

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'CSP Violation: unknown',
      expect.objectContaining({
        fingerprint: ['csp-violation', 'unknown'],
        tags: { type: 'csp-violation', directive: 'unknown' },
      }),
    );
  });

  it('redacts identifiers embedded in CSP URL paths before logging or capture', async () => {
    const privatePathReport = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'document-uri': 'https://app.dayopt.app/users/alice@example.com?token=secret',
        'blocked-uri': `https://cdn.example.com/${'x'.repeat(40)}.js`,
      },
    };

    await POST(createRequest(JSON.stringify(privatePathReport)));

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'CSP Violation: script-src-elem',
      expect.objectContaining({
        contexts: expect.objectContaining({
          csp: expect.objectContaining({
            documentUri: 'https://app.dayopt.app/users/[REDACTED_EMAIL]',
            blockedUri: 'https://cdn.example.com/[REDACTED_TOKEN].js',
          }),
        }),
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[CSP Violation]',
      expect.objectContaining({
        documentUri: 'https://app.dayopt.app/users/[REDACTED_EMAIL]',
        blockedUri: 'https://cdn.example.com/[REDACTED_TOKEN].js',
      }),
    );
  });

  it('rejects invalid schema without creating a Sentry issue', async () => {
    const response = await POST(createRequest(JSON.stringify({ 'csp-report': {} })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid report' });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON without creating a Sentry issue', async () => {
    const response = await POST(createRequest('{not-json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid report' });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized report before parsing it', async () => {
    const request = createRequest(JSON.stringify(validReport));
    request.headers.set('content-length', String(16 * 1024 + 1));

    const response = await POST(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'Report too large' });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('rejects an oversized report when content-length is absent', async () => {
    const oversizedReport = {
      ...validReport,
      'csp-report': {
        ...validReport['csp-report'],
        'original-policy': 'x'.repeat(17 * 1024),
      },
    };
    const request = createRequest(JSON.stringify(oversizedReport));
    request.headers.delete('content-length');

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('cancels a chunked body as soon as the byte limit is exceeded', async () => {
    const onCancel = vi.fn();
    const request = createStreamingRequest(
      [new Uint8Array(10 * 1024), new Uint8Array(7 * 1024), new Uint8Array(1024)],
      onCancel,
    );

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('returns rate-limit headers without reading or capturing the report', async () => {
    vi.mocked(withUpstashRateLimit).mockResolvedValue({
      state: 'checked',
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 10_000,
      pending: Promise.resolve(),
    });

    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('fails closed when the rate-limit backend is unavailable', async () => {
    vi.mocked(withUpstashRateLimit).mockResolvedValue({ state: 'unavailable' });

    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    await expect(response.json()).resolves.toEqual({ error: 'Temporarily unavailable' });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('applies an aggregate quota after the per-IP quota succeeds', async () => {
    rateLimitMocks.globalLimit.mockResolvedValue({
      success: false,
      limit: 120,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });

    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('120');
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('fails closed and captures the original aggregate limiter failure once', async () => {
    const backendError = new Error('redis unavailable');
    rateLimitMocks.globalLimit.mockRejectedValue(backendError);

    const response = await POST(createRequest(JSON.stringify(validReport)));

    expect(response.status).toBe(503);
    expect(captureUnexpectedError).toHaveBeenCalledOnce();
    expect(captureUnexpectedError).toHaveBeenCalledWith(backendError, {
      feature: 'security',
      operation: 'csp_global_rate_limit_check',
      route: '/api/csp-report',
      source: 'upstash',
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('responds to HEAD requests', async () => {
    const response = await HEAD();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
