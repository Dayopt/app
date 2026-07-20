import { describe, expect, it } from 'vitest';

import { assertProductionRuntimeEnv, type EnvConfig } from '../env';

function validProductionRuntimeEnv(): Partial<EnvConfig> {
  return {
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://dayopt.app',
    RESEND_API_KEY: 'configured',
    RESEND_FROM_EMAIL: 'contact-sender@dayopt.app',
    RESEND_WEBHOOK_SECRET: 'configured',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site-key',
    TURNSTILE_SECRET_KEY: 'secret-key',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'configured',
    NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    SENTRY_DSN: 'https://server@example.ingest.sentry.io/1',
  };
}

describe('assertProductionRuntimeEnv', () => {
  it('accepts the complete Production runtime contract', () => {
    expect(() => assertProductionRuntimeEnv(validProductionRuntimeEnv())).not.toThrow();
  });

  it('requires both browser and server DSNs in Vercel Production', () => {
    const missingBrowserDsn = validProductionRuntimeEnv();
    delete missingBrowserDsn.NEXT_PUBLIC_SENTRY_DSN;

    expect(() => assertProductionRuntimeEnv(missingBrowserDsn)).toThrow(
      'NEXT_PUBLIC_SENTRY_DSN is required for Web Sentry in Vercel Production',
    );
  });

  it('requires a Resend key and verified sender in Vercel Production', () => {
    const missingKey = validProductionRuntimeEnv();
    delete missingKey.RESEND_API_KEY;
    expect(() => assertProductionRuntimeEnv(missingKey)).toThrow(
      'RESEND_API_KEY is required for the Production contact form',
    );

    for (const sender of ['onboarding@resend.dev', 'not-an-email', 'contact@example.com']) {
      const invalidSender = validProductionRuntimeEnv();
      invalidSender.RESEND_FROM_EMAIL = sender;
      expect(() => assertProductionRuntimeEnv(invalidSender)).toThrow(
        'A verified RESEND_FROM_EMAIL is required for the Production contact form',
      );
    }
  });

  it('requires the Web-specific Resend webhook secret', () => {
    const missingSecret = validProductionRuntimeEnv();
    delete missingSecret.RESEND_WEBHOOK_SECRET;

    expect(() => assertProductionRuntimeEnv(missingSecret)).toThrow(
      'RESEND_WEBHOOK_SECRET is required for Web contact delivery monitoring',
    );
  });

  it('requires both non-blank Turnstile keys in Vercel Production', () => {
    for (const [siteKey, secretKey] of [
      ['', 'secret-key'],
      ['site-key', ''],
      ['   ', 'secret-key'],
      ['site-key', '   '],
    ] as const) {
      const invalidKeys = validProductionRuntimeEnv();
      invalidKeys.NEXT_PUBLIC_TURNSTILE_SITE_KEY = siteKey;
      invalidKeys.TURNSTILE_SECRET_KEY = secretKey;
      expect(() => assertProductionRuntimeEnv(invalidKeys)).toThrow(
        'NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required in Vercel Production',
      );
    }
  });

  it('does not require Production runtime variables in Preview', () => {
    expect(() =>
      assertProductionRuntimeEnv({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }),
    ).not.toThrow();
  });
});
