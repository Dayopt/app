import type { EnvConfig, NodeEnv, PrivacyMode } from './env-types';

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === 'production' || value === 'development' || value === 'test') {
    return value;
  }
  return 'development';
}

function parsePrivacyMode(value: string | undefined): PrivacyMode {
  return value === 'strict' ? 'strict' : 'normal';
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value ? true : undefined;
}

function warnMissingDevEnv(env: Partial<EnvConfig>): void {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  if (env.RESEND_API_KEY || env.RESEND_FROM_EMAIL || env.RESEND_WEBHOOK_SECRET) {
    console.warn(
      '[ENV WARNING] Contact Resend configuration is Production-only and is ignored in Development.',
    );
  }

  const hasTurnstileSite = Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
  const hasTurnstileSecret = Boolean(env.TURNSTILE_SECRET_KEY?.trim());
  if (hasTurnstileSite !== hasTurnstileSecret) {
    console.warn(
      '[ENV WARNING] Both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY should be set together.',
    );
  }

  const hasUpstashUrl = !!env.UPSTASH_REDIS_REST_URL;
  const hasUpstashToken = !!env.UPSTASH_REDIS_REST_TOKEN;
  if (hasUpstashUrl !== hasUpstashToken) {
    console.warn(
      '[ENV WARNING] Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN should be set together.',
    );
  }
}

export function loadEnv(): EnvConfig {
  const rawEnv = process.env;
  const env: EnvConfig = {
    NODE_ENV: parseNodeEnv(rawEnv.NODE_ENV),
    CI: parseBoolean(rawEnv.CI),
    NEXT_PUBLIC_APP_URL: rawEnv.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: rawEnv.NEXT_PUBLIC_SITE_URL,
    VERCEL_URL: rawEnv.VERCEL_URL,
    VERCEL_ENV: rawEnv.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_ENV: rawEnv.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_SENTRY_DSN: rawEnv.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_DSN: rawEnv.SENTRY_DSN,
    PRIVACY_PROTECTION_MODE: parsePrivacyMode(rawEnv.PRIVACY_PROTECTION_MODE),
    RESEND_API_KEY: rawEnv.RESEND_API_KEY,
    RESEND_FROM_EMAIL: rawEnv.RESEND_FROM_EMAIL,
    RESEND_WEBHOOK_SECRET: rawEnv.RESEND_WEBHOOK_SECRET,
    UPSTASH_REDIS_REST_URL: rawEnv.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: rawEnv.UPSTASH_REDIS_REST_TOKEN,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: rawEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: rawEnv.TURNSTILE_SECRET_KEY,
    GOOGLE_SITE_VERIFICATION: rawEnv.GOOGLE_SITE_VERIFICATION,
    YANDEX_VERIFICATION: rawEnv.YANDEX_VERIFICATION,
    YAHOO_VERIFICATION: rawEnv.YAHOO_VERIFICATION,
  };

  warnMissingDevEnv(env);
  return env;
}
