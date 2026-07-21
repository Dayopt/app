import { describe, expect, it } from 'vitest';

import {
  assertWebOperationalProductionBuildEnv,
  REQUIRED_WEB_OPERATIONAL_BUILD_ENV,
} from './production-build-gate.mjs';

function completeProductionEnv() {
  return {
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 'safe-dummy-key',
    RESEND_FROM_EMAIL: 'contact-sender@dayopt.app',
    RESEND_WEBHOOK_SECRET: 'safe-dummy-webhook-secret',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'safe-dummy-site-key',
    TURNSTILE_SECRET_KEY: 'safe-dummy-turnstile-secret',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'safe-dummy-token',
  };
}

describe('Web operational production build gate', () => {
  it('skips Preview and non-Vercel CI', () => {
    expect(assertWebOperationalProductionBuildEnv({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(assertWebOperationalProductionBuildEnv({ CI: 'true' })).toBe(false);
  });

  it('does not let CI bypass a Vercel Production contract', () => {
    expect(() =>
      assertWebOperationalProductionBuildEnv({ VERCEL_ENV: 'production', CI: 'true' }),
    ).toThrow(`Web production build requires: ${REQUIRED_WEB_OPERATIONAL_BUILD_ENV.join(', ')}`);
  });

  it('lists missing names without printing values', () => {
    expect(() => assertWebOperationalProductionBuildEnv({ VERCEL_ENV: 'production' })).toThrow(
      `Web production build requires: ${REQUIRED_WEB_OPERATIONAL_BUILD_ENV.join(', ')}`,
    );
  });

  it('accepts a complete safe Production contract', () => {
    expect(assertWebOperationalProductionBuildEnv(completeProductionEnv())).toBe(true);
  });

  it.each(['onboarding@resend.dev', 'sender@example.com', 'not-an-email'])(
    'rejects an invalid Resend sender (%s)',
    (sender) => {
      expect(() =>
        assertWebOperationalProductionBuildEnv({
          ...completeProductionEnv(),
          RESEND_FROM_EMAIL: sender,
        }),
      ).toThrow('Web production build requires a verified Dayopt RESEND_FROM_EMAIL');
    },
  );

  it('rejects a malformed Upstash URL before build work starts', () => {
    expect(() =>
      assertWebOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        UPSTASH_REDIS_REST_URL: 'not-a-url',
      }),
    ).toThrow('Web production build requires a valid UPSTASH_REDIS_REST_URL');
  });
});
