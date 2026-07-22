export type EnvVisibility = 'public' | 'secret';
export type EnvEnvironment = 'local' | 'staging' | 'production' | 'shared';

export type EnvSchemaEntry = {
  envName: string;
  required: boolean;
  visibility: EnvVisibility;
  environment: EnvEnvironment;
  vault: string;
  item: string;
  field: string;
};

export type OperationalItem = {
  vault: string;
  item: string;
  required: boolean;
};

const staging = 'Dayopt-Staging';
const production = 'Dayopt-Production';
const shared = 'Dayopt-Shared';

function envEntry(
  envName: string,
  required: boolean,
  visibility: EnvVisibility,
  environment: EnvEnvironment,
  vault: string,
  item: string,
  field = envName,
): EnvSchemaEntry {
  return { envName, required, visibility, environment, vault, item, field };
}

export const envSchema: EnvSchemaEntry[] = [
  envEntry('NEXT_PUBLIC_SUPABASE_URL', true, 'public', 'local', staging, 'supabase'),
  envEntry('NEXT_PUBLIC_SUPABASE_ANON_KEY', true, 'public', 'local', staging, 'supabase'),
  envEntry('SUPABASE_SERVICE_ROLE_KEY', true, 'secret', 'local', staging, 'supabase'),
  envEntry('SUPABASE_ACCESS_TOKEN', false, 'secret', 'staging', staging, 'supabase'),
  envEntry('SUPABASE_DB_PASSWORD', false, 'secret', 'staging', staging, 'supabase'),
  envEntry('CRON_SECRET', false, 'secret', 'staging', staging, 'supabase'),
  envEntry('SEND_EMAIL_HOOK_SECRET', false, 'secret', 'staging', staging, 'supabase'),

  envEntry('UPSTASH_REDIS_REST_URL', false, 'secret', 'staging', staging, 'upstash'),
  envEntry('UPSTASH_REDIS_REST_TOKEN', false, 'secret', 'staging', staging, 'upstash'),

  envEntry('STRIPE_SECRET_KEY', false, 'secret', 'staging', staging, 'stripe-test'),
  envEntry('STRIPE_WEBHOOK_SECRET', false, 'secret', 'staging', staging, 'stripe-test'),
  envEntry('NEXT_PUBLIC_STRIPE_PRO_PRICE_ID', false, 'public', 'staging', staging, 'stripe-test'),

  envEntry('RESEND_API_KEY', false, 'secret', 'shared', shared, 'resend'),
  envEntry('RESEND_FROM_EMAIL', false, 'public', 'shared', shared, 'resend'),
  envEntry('RESEND_WEBHOOK_SECRET', false, 'secret', 'staging', staging, 'resend'),

  envEntry('NEXT_PUBLIC_APP_URL', true, 'public', 'local', staging, 'app'),
  envEntry('NEXT_PUBLIC_SITE_URL', false, 'public', 'staging', staging, 'app'),
  envEntry('RECOVERY_CODE_PEPPER', false, 'secret', 'staging', staging, 'app'),
  envEntry('MCP_CANONICAL_RESOURCE_URI', false, 'public', 'staging', staging, 'app'),
  envEntry('MCP_WRITE_ENABLED_CLIENTS', false, 'public', 'staging', staging, 'app'),

  envEntry('NEXT_PUBLIC_TURNSTILE_SITE_KEY', false, 'public', 'shared', shared, 'turnstile'),
  envEntry('TURNSTILE_SECRET_KEY', false, 'secret', 'shared', shared, 'turnstile'),
  envEntry('ANTHROPIC_API_KEY', false, 'secret', 'shared', shared, 'anthropic'),

  envEntry('VERCEL_TOKEN', false, 'secret', 'shared', shared, 'vercel'),
  envEntry('VERCEL_TEAM_ID', false, 'public', 'shared', shared, 'vercel'),
  envEntry('VERCEL_PROJECT_ID_STAGING', false, 'public', 'shared', shared, 'vercel'),
  envEntry('VERCEL_PROJECT_ID_PRODUCTION', false, 'public', 'shared', shared, 'vercel'),

  envEntry('GOOGLE_SITE_VERIFICATION', false, 'public', 'shared', shared, 'google'),
  envEntry('YANDEX_VERIFICATION', false, 'public', 'shared', shared, 'google'),
  envEntry('YAHOO_VERIFICATION', false, 'public', 'shared', shared, 'google'),
];

export const productionEnvSchema: EnvSchemaEntry[] = [
  envEntry('NEXT_PUBLIC_SUPABASE_URL', false, 'public', 'production', production, 'supabase'),
  envEntry('NEXT_PUBLIC_SUPABASE_ANON_KEY', false, 'public', 'production', production, 'supabase'),
  envEntry('SUPABASE_SERVICE_ROLE_KEY', false, 'secret', 'production', production, 'supabase'),
  envEntry('SUPABASE_ACCESS_TOKEN', false, 'secret', 'production', production, 'supabase'),
  envEntry('SUPABASE_DB_PASSWORD', false, 'secret', 'production', production, 'supabase'),
  envEntry('CRON_SECRET', false, 'secret', 'production', production, 'supabase'),
  envEntry('SEND_EMAIL_HOOK_SECRET', false, 'secret', 'production', production, 'supabase'),
  envEntry('UPSTASH_REDIS_REST_URL', false, 'secret', 'production', production, 'upstash'),
  envEntry('UPSTASH_REDIS_REST_TOKEN', false, 'secret', 'production', production, 'upstash'),
  envEntry('STRIPE_SECRET_KEY', false, 'secret', 'production', production, 'stripe-live'),
  envEntry('STRIPE_WEBHOOK_SECRET', false, 'secret', 'production', production, 'stripe-live'),
  envEntry(
    'NEXT_PUBLIC_STRIPE_PRO_PRICE_ID',
    false,
    'public',
    'production',
    production,
    'stripe-live',
  ),
  envEntry('RESEND_WEBHOOK_SECRET', false, 'secret', 'production', production, 'resend'),
  envEntry('RESEND_WEBHOOK_SECRET', false, 'secret', 'production', production, 'resend-web'),
  envEntry('NEXT_PUBLIC_SENTRY_DSN', true, 'public', 'production', production, 'sentry'),
  envEntry('SENTRY_DSN', true, 'public', 'production', production, 'sentry'),
  envEntry('SENTRY_ORG', true, 'public', 'production', production, 'sentry'),
  envEntry('SENTRY_PROJECT', true, 'public', 'production', production, 'sentry'),
  envEntry('NEXT_PUBLIC_SENTRY_DSN', true, 'public', 'production', production, 'sentry-web'),
  envEntry('SENTRY_DSN', true, 'public', 'production', production, 'sentry-web'),
  envEntry('SENTRY_ORG', true, 'public', 'production', production, 'sentry-web'),
  envEntry('SENTRY_PROJECT', true, 'public', 'production', production, 'sentry-web'),
  envEntry('SENTRY_AUTH_TOKEN', true, 'secret', 'production', shared, 'sentry'),
  envEntry('NEXT_PUBLIC_APP_URL', false, 'public', 'production', production, 'app'),
  envEntry('NEXT_PUBLIC_SITE_URL', false, 'public', 'production', production, 'app'),
  envEntry('RECOVERY_CODE_PEPPER', false, 'secret', 'production', production, 'app'),
  envEntry('MCP_CANONICAL_RESOURCE_URI', false, 'public', 'production', production, 'app'),
  envEntry('MCP_WRITE_ENABLED_CLIENTS', false, 'public', 'production', production, 'app'),
];

export const operationalItems: OperationalItem[] = [
  { vault: shared, item: 'github-login', required: true },
  { vault: shared, item: 'github-ssh', required: true },
  { vault: shared, item: 'domain', required: true },
  { vault: shared, item: 'resend-support-replies', required: true },
  { vault: shared, item: 'recovery-codes', required: true },
];

export const onePasswordEnvSchema = [...envSchema, ...productionEnvSchema];
