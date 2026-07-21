export type NodeEnv = 'development' | 'production' | 'test';

export type PrivacyMode = 'normal' | 'strict';

export interface EnvConfig {
  NODE_ENV: NodeEnv;
  CI?: boolean;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_URL?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
  SENTRY_DSN?: string;
  PRIVACY_PROTECTION_MODE?: PrivacyMode;
  GITHUB_TOKEN?: string;
  GITHUB_CONTACT_REPO?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_SITE_VERIFICATION?: string;
  YANDEX_VERIFICATION?: string;
  YAHOO_VERIFICATION?: string;
}

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(`Environment Variable Validation Error: ${message}`);
    this.name = 'EnvValidationError';
  }
}
