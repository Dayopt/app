import { describe, expect, it } from 'vitest';

import {
  assertWebOperationalProductionBuildEnv,
  REQUIRED_WEB_OPERATIONAL_BUILD_ENV,
} from './production-build-gate.mjs';

describe('Web operational production build gate', () => {
  it('does not require Production-only rate-limit credentials in Preview or CI', () => {
    expect(assertWebOperationalProductionBuildEnv({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(assertWebOperationalProductionBuildEnv({ CI: 'true' })).toBe(false);
  });

  it('lists missing credentials without printing values', () => {
    expect(() => assertWebOperationalProductionBuildEnv({ VERCEL_ENV: 'production' })).toThrow(
      `Web production build requires: ${REQUIRED_WEB_OPERATIONAL_BUILD_ENV.join(', ')}`,
    );
  });

  it('accepts complete Production rate-limit credentials', () => {
    expect(
      assertWebOperationalProductionBuildEnv({
        VERCEL_ENV: 'production',
        GITHUB_TOKEN: 'configured',
        GITHUB_CONTACT_REPO: 'Dayopt/contact-private',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'configured',
        TURNSTILE_SECRET_KEY: 'configured',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'configured',
      }),
    ).toBe(true);
  });

  it('rejects a malformed Upstash URL before build work starts', () => {
    expect(() =>
      assertWebOperationalProductionBuildEnv({
        VERCEL_ENV: 'production',
        GITHUB_TOKEN: 'configured',
        GITHUB_CONTACT_REPO: 'Dayopt/contact-private',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'configured',
        TURNSTILE_SECRET_KEY: 'configured',
        UPSTASH_REDIS_REST_URL: 'not-a-url',
        UPSTASH_REDIS_REST_TOKEN: 'configured',
      }),
    ).toThrow('Web production build requires a valid UPSTASH_REDIS_REST_URL');
  });

  it('refuses the known public repository before build work starts', () => {
    expect(() =>
      assertWebOperationalProductionBuildEnv({
        VERCEL_ENV: 'production',
        GITHUB_TOKEN: 'configured',
        GITHUB_CONTACT_REPO: 'Dayopt/dayopt',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'configured',
        TURNSTILE_SECRET_KEY: 'configured',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'configured',
      }),
    ).toThrow('Web production build refuses the public Dayopt/dayopt contact repository');
  });
});
