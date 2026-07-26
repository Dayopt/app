export const REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

export const REQUIRED_PRODUCT_STAGING_BUILD_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RECOVERY_CODE_PEPPER',
  'MCP_OAUTH_ENVIRONMENT',
  'OAUTH_AUTHORIZATION_SERVER_URI',
  'MCP_CANONICAL_RESOURCE_URI',
  'NEXT_PUBLIC_APP_URL',
];

export const FORBIDDEN_PRODUCT_STAGING_BUILD_ENV = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_WEBHOOK_SECRET',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_DSN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_AUTH_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PRO_PRICE_ID',
  'SLACK_BILLING_WEBHOOK_URL',
];

export const PRODUCT_PRODUCTION_ORIGIN = 'https://app.dayopt.app';
export const MCP_PRODUCTION_ORIGIN = 'https://mcp.dayopt.app';
export const PRODUCT_STAGING_ORIGIN = 'https://staging.dayopt.app';
export const MCP_STAGING_ORIGIN = 'https://mcp.staging.dayopt.app';
const GOOGLE_CALENDAR_STAGING_CALLBACK = `${PRODUCT_STAGING_ORIGIN}/api/integrations/google-calendar/callback`;
const PRODUCTION_SUPABASE_HOST = 'yvglwblxrnrenfifsnje.supabase.co';

/**
 * Expose only the MCP resource owned by this deploy to client components.
 *
 * Generic Preview and other Vercel environments do not own a stable OAuth
 * surface, so they must not advertise either the Production or staging URL.
 * The build assertions run before this resolver in next.config.mjs.
 */
export function resolveProductPublicMcpResourceUri(env) {
  if (!env.VERCEL_ENV) {
    return env.MCP_OAUTH_ENVIRONMENT === 'staging' ? MCP_STAGING_ORIGIN : MCP_PRODUCTION_ORIGIN;
  }
  if (env.VERCEL_ENV === 'production') return MCP_PRODUCTION_ORIGIN;
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_TARGET_ENV === 'staging') {
    return MCP_STAGING_ORIGIN;
  }
  return '';
}

function hasNonEmptyValue(env, name) {
  return typeof env[name] === 'string' && env[name].trim() !== '';
}

function isVerifiedDayoptSender(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254) return false;
  if (normalized === 'onboarding@resend.dev') return false;

  const parts = normalized.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..') ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(localPart)
  ) {
    return false;
  }

  return domain === 'dayopt.app';
}

/** Prevent a Production deploy with unavailable delivery, monitoring, or abuse controls. */
export function assertProductOperationalProductionBuildEnv(env) {
  if (env.VERCEL_ENV !== 'production') return false;

  if (
    env.VERCEL_TARGET_ENV === 'staging' ||
    (hasNonEmptyValue(env, 'MCP_OAUTH_ENVIRONMENT') &&
      env.MCP_OAUTH_ENVIRONMENT !== 'production') ||
    (hasNonEmptyValue(env, 'OAUTH_AUTHORIZATION_SERVER_URI') &&
      env.OAUTH_AUTHORIZATION_SERVER_URI !== PRODUCT_PRODUCTION_ORIGIN) ||
    (hasNonEmptyValue(env, 'MCP_CANONICAL_RESOURCE_URI') &&
      env.MCP_CANONICAL_RESOURCE_URI !== MCP_PRODUCTION_ORIGIN)
  ) {
    throw new Error('Product production build cannot use the staging OAuth identity');
  }

  const missingNames = REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV.filter(
    (name) => typeof env[name] !== 'string' || env[name].trim() === '',
  );
  if (missingNames.length > 0) {
    throw new Error(`Product production build requires: ${missingNames.join(', ')}`);
  }

  if (!isVerifiedDayoptSender(env.RESEND_FROM_EMAIL)) {
    throw new Error('Product production build requires an apex dayopt.app RESEND_FROM_EMAIL');
  }

  try {
    const redisUrl = new URL(env.UPSTASH_REDIS_REST_URL);
    if (redisUrl.protocol !== 'https:' || !redisUrl.hostname) throw new Error();
  } catch {
    throw new Error('Product production build requires a valid UPSTASH_REDIS_REST_URL');
  }

  return true;
}

/**
 * Fail closed before a Vercel Custom Environment build can advertise staging
 * OAuth identity with Production data, delivery, billing, or telemetry config.
 */
export function assertProductStagingBuildEnv(env) {
  if (env.VERCEL_TARGET_ENV !== 'staging') return false;

  if (env.VERCEL_ENV !== 'preview') {
    throw new Error('Product staging build requires VERCEL_ENV=preview');
  }

  const missingNames = REQUIRED_PRODUCT_STAGING_BUILD_ENV.filter(
    (name) => !hasNonEmptyValue(env, name),
  );
  if (missingNames.length > 0) {
    throw new Error(`Product staging build requires: ${missingNames.join(', ')}`);
  }

  const forbiddenNames = FORBIDDEN_PRODUCT_STAGING_BUILD_ENV.filter((name) =>
    hasNonEmptyValue(env, name),
  );
  if (forbiddenNames.length > 0) {
    throw new Error(`Product staging build forbids: ${forbiddenNames.join(', ')}`);
  }

  if (env.BILLING_ENFORCED === 'true') {
    throw new Error('Product staging build forbids BILLING_ENFORCED=true');
  }
  if (env.MCP_OAUTH_ENVIRONMENT !== 'staging') {
    throw new Error('Product staging build requires MCP_OAUTH_ENVIRONMENT=staging');
  }
  if (env.OAUTH_AUTHORIZATION_SERVER_URI !== PRODUCT_STAGING_ORIGIN) {
    throw new Error(
      'Product staging build requires the canonical staging authorization server URI',
    );
  }
  if (env.MCP_CANONICAL_RESOURCE_URI !== MCP_STAGING_ORIGIN) {
    throw new Error('Product staging build requires the canonical staging MCP resource URI');
  }
  if (env.NEXT_PUBLIC_APP_URL !== PRODUCT_STAGING_ORIGIN) {
    throw new Error('Product staging build requires the canonical staging Product URL');
  }
  assertStagingSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  assertHttpsUrl(env.UPSTASH_REDIS_REST_URL, 'UPSTASH_REDIS_REST_URL');
  assertStagingCalendarConfiguration(env);

  return true;
}

function assertStagingCalendarConfiguration(env) {
  const names = [
    'GOOGLE_CALENDAR_CLIENT_ID',
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    'CALENDAR_TOKEN_ENCRYPTION_KEY',
    'GOOGLE_CALENDAR_REDIRECT_URIS',
    'CRON_SECRET',
  ];
  const configuredNames = names.filter((name) => hasNonEmptyValue(env, name));
  if (configuredNames.length === 0) return;
  if (configuredNames.length !== names.length) {
    throw new Error(`Product staging Calendar configuration requires: ${names.join(', ')}`);
  }
  if (env.GOOGLE_CALENDAR_REDIRECT_URIS !== GOOGLE_CALENDAR_STAGING_CALLBACK) {
    throw new Error('Product staging build requires the exact staging Calendar redirect URI');
  }
}

function assertStagingSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Product staging build requires a valid NEXT_PUBLIC_SUPABASE_URL');
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith('.supabase.co') ||
    url.hostname === PRODUCTION_SUPABASE_HOST
  ) {
    throw new Error('Product staging build requires a non-Production Supabase branch API origin');
  }
}

function assertHttpsUrl(value, name) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname) throw new Error();
  } catch {
    throw new Error(`Product staging build requires a valid ${name}`);
  }
}
