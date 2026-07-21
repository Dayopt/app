import { describe, expect, it } from 'vitest';

import {
  assertProductOperationalProductionBuildEnv,
  REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV,
} from './production-build-gate.mjs';

function completeProductionEnv() {
  return {
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 'safe-dummy-key',
    RESEND_FROM_EMAIL: 'contact-sender@dayopt.app',
    RESEND_WEBHOOK_SECRET: 'safe-dummy-webhook-secret',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'safe-dummy-token',
  };
}

describe('Product operational production build gate', () => {
  it('skips Preview and non-Vercel CI', () => {
    expect(assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(assertProductOperationalProductionBuildEnv({ CI: 'true' })).toBe(false);
  });

  it('does not let CI bypass a Vercel Production contract', () => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'production', CI: 'true' }),
    ).toThrow(`Product production build requires: ${REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV.join(', ')}`);
  });

  it('lists missing names without printing values', () => {
    expect(() => assertProductOperationalProductionBuildEnv({ VERCEL_ENV: 'production' })).toThrow(
      `Product production build requires: ${REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV.join(', ')}`,
    );
  });

  it('accepts a complete safe Production contract', () => {
    expect(assertProductOperationalProductionBuildEnv(completeProductionEnv())).toBe(true);
  });

  it.each(['onboarding@resend.dev', 'sender@example.com', 'not-an-email'])(
    'rejects an invalid Resend sender (%s)',
    (sender) => {
      expect(() =>
        assertProductOperationalProductionBuildEnv({
          ...completeProductionEnv(),
          RESEND_FROM_EMAIL: sender,
        }),
      ).toThrow('Product production build requires a verified Dayopt RESEND_FROM_EMAIL');
    },
  );

  it('rejects a malformed Upstash URL before build work starts', () => {
    expect(() =>
      assertProductOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        UPSTASH_REDIS_REST_URL: 'not-a-url',
      }),
    ).toThrow('Product production build requires a valid UPSTASH_REDIS_REST_URL');
  });
});
