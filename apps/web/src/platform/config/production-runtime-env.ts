import { EnvValidationError, type EnvConfig } from './env-types';
import { loadEnv } from './load-env';

export function assertProductionRuntimeEnv(env: Partial<EnvConfig> = loadEnv()): void {
  if (env.CI || env.VERCEL_ENV !== 'production') {
    return;
  }

  const errors: string[] = [];

  if (!env.NEXT_PUBLIC_APP_URL && !env.VERCEL_URL) {
    errors.push('NEXT_PUBLIC_APP_URL or VERCEL_URL is required in production environment');
  }

  if (!env.GITHUB_TOKEN) {
    errors.push('GITHUB_TOKEN is not set. Contact form will not work.');
  }

  if (!env.GITHUB_CONTACT_REPO) {
    errors.push('GITHUB_CONTACT_REPO is required for the private contact repository.');
  }

  const requiredSentryEnv = [
    ['NEXT_PUBLIC_SENTRY_DSN', env.NEXT_PUBLIC_SENTRY_DSN],
    ['SENTRY_DSN', env.SENTRY_DSN],
  ] as const;

  for (const [name, value] of requiredSentryEnv) {
    if (!value) {
      errors.push(`${name} is required for Web Sentry in Vercel Production`);
    }
  }

  const hasTurnstileSite = !!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const hasTurnstileSecret = !!env.TURNSTILE_SECRET_KEY;
  if (!hasTurnstileSite || !hasTurnstileSecret) {
    errors.push(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required in production.',
    );
  }

  const hasUpstashUrl = !!env.UPSTASH_REDIS_REST_URL;
  const hasUpstashToken = !!env.UPSTASH_REDIS_REST_TOKEN;
  if (hasUpstashUrl !== hasUpstashToken) {
    errors.push('Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN should be set together.');
  }

  if (!hasUpstashUrl || !hasUpstashToken) {
    errors.push(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production (rate limit becomes pass-through without them)',
    );
  }

  if (errors.length > 0) {
    throw new EnvValidationError(`\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  }
}
