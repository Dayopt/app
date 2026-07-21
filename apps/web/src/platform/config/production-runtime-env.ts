import { z } from 'zod';

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

  if (!env.RESEND_API_KEY?.trim()) {
    errors.push('RESEND_API_KEY is required for the Production contact form');
  }

  const senderResult = z.string().trim().email().safeParse(env.RESEND_FROM_EMAIL);
  if (
    !senderResult.success ||
    senderResult.data.toLowerCase() === 'onboarding@resend.dev' ||
    !senderResult.data.toLowerCase().endsWith('@dayopt.app')
  ) {
    errors.push('A verified RESEND_FROM_EMAIL is required for the Production contact form');
  }

  if (!env.RESEND_WEBHOOK_SECRET?.trim()) {
    errors.push('RESEND_WEBHOOK_SECRET is required for Web contact delivery monitoring');
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

  const hasTurnstileSite = Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
  const hasTurnstileSecret = Boolean(env.TURNSTILE_SECRET_KEY?.trim());
  if (!hasTurnstileSite || !hasTurnstileSecret) {
    errors.push(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required in Vercel Production.',
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
