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
  /**
   * schema が実態より先行している optional entry の理由。1password:check が
   * 非 OK 状態を表示する際、この文言を添えて「機能未展開だから欠けている」ことを
   * 明示する（#2063）。required entry には付けない（そちらは exit 1 の理由が
   * すでに status 行だけで自明なため）。
   */
  pendingReason?: string;
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

/** schema先行 entry 用。pendingReason 付きの envEntry。 */
function pendingEnvEntry(
  envName: string,
  visibility: EnvVisibility,
  environment: EnvEnvironment,
  vault: string,
  item: string,
  pendingReason: string,
  field = envName,
): EnvSchemaEntry {
  return { envName, required: false, visibility, environment, vault, item, field, pendingReason };
}

export const envSchema: EnvSchemaEntry[] = [
  // Supabase の接続情報（URL / anon key / service role key / DB password）は
  // Dayopt-Staging に置かない。常設 staging が存在せず、この 4 field は
  // production の複製になっていた。local dev の接続は scripts/dev-with-op.sh が
  // supabase status -o env から注入するため 1Password を経由しない。
  // SUPABASE_ACCESS_TOKEN は Dayopt-Production/supabase を正本に一本化した
  // （#1933）。production と同一値の複製を staging から読む理由が無いため、
  // ここには entry を置かない。
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
  pendingEnvEntry(
    'STRIPE_ACCOUNT_ID',
    'public',
    'production',
    production,
    'stripe-live',
    '課金未有効化のため未設定（2026-08-11 実測）。durable Billing 有効化時に STRIPE_SECRET_KEY と併せて設定する',
  ),
  pendingEnvEntry(
    'STRIPE_LIVEMODE',
    'public',
    'production',
    production,
    'stripe-live',
    '課金未有効化のため未設定（2026-08-11 実測）。durable Billing 有効化時に STRIPE_SECRET_KEY と併せて設定する',
  ),
  pendingEnvEntry(
    'STRIPE_WEBHOOK_SECRET',
    'secret',
    'production',
    production,
    'stripe-live',
    '課金未有効化のため未設定（2026-08-11 実測）',
  ),
  pendingEnvEntry(
    'NEXT_PUBLIC_STRIPE_PRO_PRICE_ID',
    'public',
    'production',
    production,
    'stripe-live',
    '課金未有効化のため未設定（2026-08-11 実測）',
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
  // item 名は sentry ではなく sentry-login（2026-08-14 実測の命名 drift、#2063）。
  // 修正前は op の曖昧解決で偶然通っていたが、1password:check の恒久 red の
  // 直接原因だった（required entry が MISSING_ITEM で fail）。
  envEntry('SENTRY_AUTH_TOKEN', true, 'secret', 'production', shared, 'sentry-login'),
  // NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL / RECOVERY_CODE_PEPPER は
  // replica（Vercel Production Env）に値がある可能性がある「反映漏れ」枠。
  // schema先行（機能未展開）ではないため pendingReason は付けない。EMPTY の場合は
  // docs/operations/secrets.md §1password:check が失敗した時 の「本当の欠落」
  // 判定に従い、Vercel → master への逆流で埋める（#1940 の枠）。
  envEntry('NEXT_PUBLIC_APP_URL', false, 'public', 'production', production, 'app'),
  envEntry('NEXT_PUBLIC_SITE_URL', false, 'public', 'production', production, 'app'),
  envEntry('RECOVERY_CODE_PEPPER', false, 'secret', 'production', production, 'app'),
  ...(
    [
      'OAUTH_CLAUDE_REDIRECT_URIS',
      'OAUTH_CHATGPT_REDIRECT_URIS',
      'OAUTH_CURSOR_REDIRECT_URIS',
      'MCP_OAUTH_ENVIRONMENT',
      'OAUTH_AUTHORIZATION_SERVER_URI',
      'MCP_CANONICAL_RESOURCE_URI',
      'MCP_WRITE_ENABLED_CLIENTS',
    ] as const
  ).map((field) =>
    pendingEnvEntry(
      field,
      'public',
      'production',
      production,
      'app',
      '#1754（MCP OAuth epic、status:watching）の production 未展開分',
    ),
  ),

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
