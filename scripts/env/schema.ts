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

/** 実在してはいけない field。存在すれば 1password:check を失敗させる。 */
export type ForbiddenField = {
  vault: string;
  item: string;
  field: string;
  reason: string;
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
  // Supabase の接続情報（URL / anon key / service role key / DB password）は
  // Dayopt-Staging に置かない。常設 staging が存在せず、この 4 field は
  // production の複製になっていた。local dev の接続は scripts/dev-with-op.sh が
  // supabase status -o env から注入するため 1Password を経由しない。
  envEntry('SUPABASE_ACCESS_TOKEN', false, 'secret', 'staging', staging, 'supabase'),
  envEntry('CRON_SECRET', false, 'secret', 'staging', staging, 'supabase'),
  envEntry('SEND_EMAIL_HOOK_SECRET', false, 'secret', 'staging', staging, 'supabase'),

  envEntry('UPSTASH_REDIS_REST_URL', false, 'secret', 'staging', staging, 'upstash'),
  envEntry('UPSTASH_REDIS_REST_TOKEN', false, 'secret', 'staging', staging, 'upstash'),

  envEntry('STRIPE_SECRET_KEY', false, 'secret', 'staging', staging, 'stripe-test'),
  envEntry('STRIPE_ACCOUNT_ID', false, 'public', 'staging', staging, 'stripe-test'),
  envEntry('STRIPE_LIVEMODE', false, 'public', 'staging', staging, 'stripe-test'),
  envEntry('STRIPE_WEBHOOK_SECRET', false, 'secret', 'staging', staging, 'stripe-test'),
  envEntry('NEXT_PUBLIC_STRIPE_PRO_PRICE_ID', false, 'public', 'staging', staging, 'stripe-test'),

  envEntry('RESEND_API_KEY', false, 'secret', 'shared', shared, 'resend'),
  envEntry('RESEND_FROM_EMAIL', false, 'public', 'shared', shared, 'resend'),
  envEntry('RESEND_WEBHOOK_SECRET', false, 'secret', 'staging', staging, 'resend'),

  envEntry('NEXT_PUBLIC_APP_URL', true, 'public', 'local', staging, 'app'),
  envEntry('NEXT_PUBLIC_SITE_URL', false, 'public', 'staging', staging, 'app'),
  envEntry('RECOVERY_CODE_PEPPER', false, 'secret', 'staging', staging, 'app'),
  envEntry('OAUTH_CLAUDE_REDIRECT_URIS', false, 'public', 'staging', staging, 'app'),
  envEntry('OAUTH_CHATGPT_REDIRECT_URIS', false, 'public', 'staging', staging, 'app'),
  envEntry('OAUTH_CURSOR_REDIRECT_URIS', false, 'public', 'staging', staging, 'app'),
  envEntry('MCP_OAUTH_ENVIRONMENT', false, 'public', 'staging', staging, 'app'),
  envEntry('OAUTH_AUTHORIZATION_SERVER_URI', false, 'public', 'staging', staging, 'app'),
  envEntry('MCP_CANONICAL_RESOURCE_URI', false, 'public', 'staging', staging, 'app'),
  envEntry('MCP_OAUTH_PREVIEW_BRANCH', false, 'public', 'staging', staging, 'app'),
  envEntry('MCP_OAUTH_PREVIEW_UPSTASH_HOST', false, 'public', 'staging', staging, 'app'),
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

  // 外部カレンダー取り込み用の専用 OAuth client（Supabase Auth の Google provider とは別物）
  envEntry('GOOGLE_CALENDAR_CLIENT_ID', false, 'public', 'staging', staging, 'google-calendar'),
  envEntry(
    'GOOGLE_CALENDAR_PROJECT_NUMBER',
    false,
    'public',
    'staging',
    staging,
    'google-calendar',
  ),
  envEntry('GOOGLE_CALENDAR_CLIENT_SECRET', false, 'secret', 'staging', staging, 'google-calendar'),
  envEntry('CALENDAR_TOKEN_ENCRYPTION_KEY', false, 'secret', 'staging', staging, 'google-calendar'),
  envEntry('GOOGLE_CALENDAR_REDIRECT_URIS', false, 'public', 'staging', staging, 'google-calendar'),
];

export const productionEnvSchema: EnvSchemaEntry[] = [
  // Supabase の接続情報はここが唯一の master。Staging 側の複製を撤去した分の
  // required 検査をこちらへ移す。欠けると production の runtime に加えて、
  // .op-env.admin 経由の管理者運用（緊急時のユーザー復旧）が op run の
  // 参照解決で止まる。
  envEntry('NEXT_PUBLIC_SUPABASE_URL', true, 'public', 'production', production, 'supabase'),
  envEntry('NEXT_PUBLIC_SUPABASE_ANON_KEY', true, 'public', 'production', production, 'supabase'),
  envEntry('SUPABASE_SERVICE_ROLE_KEY', true, 'secret', 'production', production, 'supabase'),
  envEntry('SUPABASE_ACCESS_TOKEN', false, 'secret', 'production', production, 'supabase'),
  // .op-env.admin 経由の `supabase db query --linked` が要求する。欠けると
  // seed が user 作成だけ成功して DB 投入で止まり、部分適用になる。
  envEntry('SUPABASE_DB_PASSWORD', true, 'secret', 'production', production, 'supabase'),
  envEntry('CRON_SECRET', false, 'secret', 'production', production, 'supabase'),
  envEntry('SEND_EMAIL_HOOK_SECRET', false, 'secret', 'production', production, 'supabase'),
  envEntry('UPSTASH_REDIS_REST_URL', false, 'secret', 'production', production, 'upstash'),
  envEntry('UPSTASH_REDIS_REST_TOKEN', false, 'secret', 'production', production, 'upstash'),
  envEntry('STRIPE_SECRET_KEY', false, 'secret', 'production', production, 'stripe-live'),
  envEntry('STRIPE_ACCOUNT_ID', false, 'public', 'production', production, 'stripe-live'),
  envEntry('STRIPE_LIVEMODE', false, 'public', 'production', production, 'stripe-live'),
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
  envEntry('OAUTH_CLAUDE_REDIRECT_URIS', false, 'public', 'production', production, 'app'),
  envEntry('OAUTH_CHATGPT_REDIRECT_URIS', false, 'public', 'production', production, 'app'),
  envEntry('OAUTH_CURSOR_REDIRECT_URIS', false, 'public', 'production', production, 'app'),
  envEntry('MCP_OAUTH_ENVIRONMENT', false, 'public', 'production', production, 'app'),
  envEntry('OAUTH_AUTHORIZATION_SERVER_URI', false, 'public', 'production', production, 'app'),
  envEntry('MCP_CANONICAL_RESOURCE_URI', false, 'public', 'production', production, 'app'),
  envEntry('MCP_WRITE_ENABLED_CLIENTS', false, 'public', 'production', production, 'app'),

  envEntry(
    'GOOGLE_CALENDAR_CLIENT_ID',
    false,
    'public',
    'production',
    production,
    'google-calendar',
  ),
  envEntry(
    'GOOGLE_CALENDAR_PROJECT_NUMBER',
    false,
    'public',
    'production',
    production,
    'google-calendar',
  ),
  envEntry(
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    false,
    'secret',
    'production',
    production,
    'google-calendar',
  ),
  envEntry(
    'CALENDAR_TOKEN_ENCRYPTION_KEY',
    false,
    'secret',
    'production',
    production,
    'google-calendar',
  ),
  // production には production origin だけを入れる。localhost を混ぜると
  // forwarded host 経由で allowlist を通過されうる。
  envEntry(
    'GOOGLE_CALENDAR_REDIRECT_URIS',
    false,
    'public',
    'production',
    production,
    'google-calendar',
  ),
];

// schema から entry を消しても、実 vault に field が残っていれば
// Dayopt-Staging へのアクセスだけで production の接続情報が取れてしまう。
// schema の不在（envSchema 側）と実在の禁止（ここ）は別物なので両方を持つ。
export const forbiddenFields: ForbiddenField[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
].map((field) => ({
  vault: staging,
  item: 'supabase',
  field,
  reason: '常設 staging が無いため、この field は production の複製にしかならない',
}));

export const operationalItems: OperationalItem[] = [
  { vault: shared, item: 'github-login', required: true },
  { vault: shared, item: 'github-ssh', required: true },
  { vault: shared, item: 'domain', required: true },
  { vault: shared, item: 'resend-support-replies', required: true },
];

export const onePasswordEnvSchema = [...envSchema, ...productionEnvSchema];
