import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertProductionRuntimeEnv, EnvValidationError, loadEnv, type EnvConfig } from '../env';

function validProductionRuntimeEnv(): Partial<EnvConfig> {
  return {
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://dayopt.app',
    RESEND_API_KEY: 'configured',
    RESEND_FROM_EMAIL: 'noreply@dayopt.app',
    RESEND_WEBHOOK_SECRET: 'configured',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site-key',
    TURNSTILE_SECRET_KEY: 'secret-key',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'configured',
    NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
    SENTRY_DSN: 'https://server@example.ingest.sentry.io/1',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('assertProductionRuntimeEnv', () => {
  it('完全な Vercel Production env を受け入れる', () => {
    expect(() => assertProductionRuntimeEnv(validProductionRuntimeEnv())).not.toThrow();

    const apexSender = validProductionRuntimeEnv();
    apexSender.RESEND_FROM_EMAIL = 'contact-sender@dayopt.app';
    expect(() => assertProductionRuntimeEnv(apexSender)).not.toThrow();
  });

  it('CI と Preview では production secret を要求しない', () => {
    expect(() =>
      assertProductionRuntimeEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production', CI: true }),
    ).not.toThrow();
    expect(() =>
      assertProductionRuntimeEnv({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }),
    ).not.toThrow();
  });

  it('Production の不足項目を既存順序でまとめて報告する', () => {
    let thrown: unknown;
    try {
      assertProductionRuntimeEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvValidationError);
    const message = (thrown as Error).message;
    const expectedOrder = [
      'NEXT_PUBLIC_APP_URL or VERCEL_URL',
      'RESEND_API_KEY is required',
      'An apex dayopt.app RESEND_FROM_EMAIL is required',
      'RESEND_WEBHOOK_SECRET is required',
      'NEXT_PUBLIC_SENTRY_DSN is required',
      'SENTRY_DSN is required',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY',
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required',
    ];

    let previousIndex = -1;
    for (const part of expectedOrder) {
      const index = message.indexOf(part);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  it('Resend key・検証済みsender・Web固有webhook secretを要求する', () => {
    const missingKey = validProductionRuntimeEnv();
    delete missingKey.RESEND_API_KEY;
    expect(() => assertProductionRuntimeEnv(missingKey)).toThrow(
      'RESEND_API_KEY is required for the Production contact form',
    );

    for (const sender of [
      'onboarding@resend.dev',
      'not-an-email',
      'contact@example.com',
      'contact@notdayopt.app',
      'contact@dayopt.app.example.com',
      'noreply@send.dayopt.app',
    ]) {
      const invalidSender = validProductionRuntimeEnv();
      invalidSender.RESEND_FROM_EMAIL = sender;
      expect(() => assertProductionRuntimeEnv(invalidSender)).toThrow(
        'An apex dayopt.app RESEND_FROM_EMAIL is required for the Production contact form',
      );
    }

    const missingWebhookSecret = validProductionRuntimeEnv();
    delete missingWebhookSecret.RESEND_WEBHOOK_SECRET;
    expect(() => assertProductionRuntimeEnv(missingWebhookSecret)).toThrow(
      'RESEND_WEBHOOK_SECRET is required for Web contact delivery monitoring',
    );
  });

  it('Turnstile keyの空白値を拒否する', () => {
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

  it('Upstash の片側だけがある場合は pair と required の両方を報告する', () => {
    const env = validProductionRuntimeEnv();
    delete env.UPSTASH_REDIS_REST_TOKEN;

    expect(() => assertProductionRuntimeEnv(env)).toThrow(
      'Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN should be set together',
    );
    expect(() => assertProductionRuntimeEnv(env)).toThrow(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production',
    );
  });

  it('引数省略時は現在の process.env を読み直す', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(() => assertProductionRuntimeEnv()).not.toThrow();
  });
});

describe('loadEnv', () => {
  it('boolean と privacy mode を既存規則で parse する', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CI', '0');
    vi.stubEnv('PRIVACY_PROTECTION_MODE', 'strict');

    expect(loadEnv()).toMatchObject({
      NODE_ENV: 'test',
      CI: false,
      PRIVACY_PROTECTION_MODE: 'strict',
    });
  });

  it('development でProduction専用Resendと片側設定を3件 warning する', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', 'configured');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'configured');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    loadEnv();

    expect(warn.mock.calls).toEqual([
      [
        '[ENV WARNING] Contact Resend configuration is Production-only and is ignored in Development.',
      ],
      [
        '[ENV WARNING] Both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY should be set together.',
      ],
      [
        '[ENV WARNING] Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN should be set together.',
      ],
    ]);
  });
});
