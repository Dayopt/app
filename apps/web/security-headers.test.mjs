import { describe, expect, it } from 'vitest';

import { buildWebContentSecurityPolicy } from './security-headers.mjs';

describe('Web Content-Security-Policy', () => {
  it('allows only the exact Sentry ingest origin and required browser providers', () => {
    const policy = buildWebContentSecurityPolicy({
      isDevelopment: false,
      sentryIngestOrigin: 'https://o1.ingest.us.sentry.io',
    });

    expect(policy).toContain('connect-src');
    expect(policy).toContain('https://o1.ingest.us.sentry.io');
    expect(policy).not.toContain('*.sentry.io');
    expect(policy).toContain('script-src');
    expect(policy).toContain('https://challenges.cloudflare.com');
    expect(policy).toContain(
      "frame-src 'self' https://vercel.live https://challenges.cloudflare.com",
    );
    expect(policy).toContain('report-uri /api/csp-report');
    expect(policy).not.toContain('worker-src');
  });

  it('adds unsafe-eval only for local development', () => {
    expect(
      buildWebContentSecurityPolicy({ isDevelopment: true, sentryIngestOrigin: undefined }),
    ).toContain("'unsafe-eval'");
    expect(
      buildWebContentSecurityPolicy({ isDevelopment: false, sentryIngestOrigin: undefined }),
    ).not.toContain("'unsafe-eval'");
  });
});
