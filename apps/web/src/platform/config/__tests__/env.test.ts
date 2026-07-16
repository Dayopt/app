import { describe, expect, it } from 'vitest';

import { assertProductionRuntimeEnv, type EnvConfig } from '../env';

function validProductionRuntimeEnv(): Partial<EnvConfig> {
  return {
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://dayopt.com',
    GITHUB_TOKEN: 'configured',
    GITHUB_CONTACT_REPO: 'Dayopt/contact-private',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'configured',
    TURNSTILE_SECRET_KEY: 'configured',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'configured',
    NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    SENTRY_DSN: 'https://server@example.ingest.sentry.io/1',
  };
}

describe('assertProductionRuntimeEnv', () => {
  it('accepts runtime Sentry DSNs without build-only upload credentials', () => {
    expect(() => assertProductionRuntimeEnv(validProductionRuntimeEnv())).not.toThrow();
  });

  it('requires both browser and server DSNs in Vercel Production', () => {
    const missingBrowserDsn = validProductionRuntimeEnv();
    delete missingBrowserDsn.NEXT_PUBLIC_SENTRY_DSN;

    expect(() => assertProductionRuntimeEnv(missingBrowserDsn)).toThrow(
      'NEXT_PUBLIC_SENTRY_DSN is required for Web Sentry in Vercel Production',
    );
  });

  it('requires both Turnstile credentials in Vercel Production', () => {
    const missingTurnstileSecret = validProductionRuntimeEnv();
    delete missingTurnstileSecret.TURNSTILE_SECRET_KEY;

    expect(() => assertProductionRuntimeEnv(missingTurnstileSecret)).toThrow(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required in production',
    );
  });

  it('requires an explicit contact repository in Vercel Production', () => {
    const missingContactRepository = validProductionRuntimeEnv();
    delete missingContactRepository.GITHUB_CONTACT_REPO;

    expect(() => assertProductionRuntimeEnv(missingContactRepository)).toThrow(
      'GITHUB_CONTACT_REPO is required for the private contact repository',
    );
  });

  it('does not require Sentry runtime variables in Preview', () => {
    expect(() =>
      assertProductionRuntimeEnv({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }),
    ).not.toThrow();
  });
});
