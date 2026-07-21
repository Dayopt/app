import { describe, expect, it } from 'vitest';

import {
  assertWebOperationalProductionBuildEnv,
  REQUIRED_WEB_OPERATIONAL_BUILD_ENV,
} from './production-build-gate.mjs';

function completeProductionEnv() {
  return {
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 'safe-dummy-key',
    RESEND_FROM_EMAIL: 'noreply@send.dayopt.app',
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

  it.each(['contact-sender@dayopt.app', 'noreply@send.dayopt.app'])(
    'accepts a verified Dayopt sender (%s)',
    (sender) => {
      expect(
        assertWebOperationalProductionBuildEnv({
          ...completeProductionEnv(),
          RESEND_FROM_EMAIL: sender,
        }),
      ).toBe(true);
    },
  );

  it.each([
    'onboarding@resend.dev',
    'sender@example.com',
    'sender@notdayopt.app',
    'sender@dayopt.app.example.com',
    'sender@.dayopt.app',
    'not-an-email',
  ])('rejects an invalid Resend sender (%s)', (sender) => {
    expect(() =>
      assertWebOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        RESEND_FROM_EMAIL: sender,
      }),
    ).toThrow('Web production build requires a verified Dayopt RESEND_FROM_EMAIL');
  });

  it('rejects a Resend sender longer than 254 characters', () => {
    const oversizedSender = `${'a'.repeat(64)}@${'b'.repeat(59)}.${'c'.repeat(59)}.${'d'.repeat(59)}.dayopt.app`;
    expect(oversizedSender).toHaveLength(255);
    expect(() =>
      assertWebOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        RESEND_FROM_EMAIL: oversizedSender,
      }),
    ).toThrow('Web production build requires a verified Dayopt RESEND_FROM_EMAIL');
  });

  it('rejects a malformed Upstash URL before build work starts', () => {
    expect(() =>
      assertWebOperationalProductionBuildEnv({
        ...completeProductionEnv(),
        UPSTASH_REDIS_REST_URL: 'not-a-url',
      }),
    ).toThrow('Web production build requires a valid UPSTASH_REDIS_REST_URL');
  });
});
