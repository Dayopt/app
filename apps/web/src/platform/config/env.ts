/**
 * 環境変数の型定義とバリデーション
 *
 * 型安全な環境変数アクセスを提供し、実行時のバリデーションを行います。
 * 必須の環境変数が未設定の場合、起動時にエラーをスローします。
 */

/**
 * アプリケーション環境
 */
export type NodeEnv = 'development' | 'production' | 'test';

/**
 * プライバシー保護モード
 */
export type PrivacyMode = 'normal' | 'strict';

/**
 * 環境変数の型定義
 */
export interface EnvConfig {
  // ============================================================================
  // Node.js 環境
  // ============================================================================

  /**
   * Node.js 実行環境
   *
   * @default 'development'
   */
  NODE_ENV: NodeEnv;

  /**
   * CI/CD 環境フラグ
   *
   * @description GitHub Actions などの CI 環境で自動的に設定されます
   */
  CI?: boolean;

  // ============================================================================
  // アプリケーション設定
  // ============================================================================

  /**
   * アプリケーションの公開 URL
   *
   * @required Production環境では必須
   * @example 'https://dayopt.app'
   */
  NEXT_PUBLIC_APP_URL?: string;

  /**
   * サイトの公開 URL（SEO・OGP用）
   *
   * @default 'https://dayopt.app'
   */
  NEXT_PUBLIC_SITE_URL?: string;

  /**
   * Vercel のデプロイURL
   *
   * @description Vercel環境で自動的に設定されます
   */
  VERCEL_URL?: string;

  // ============================================================================
  // セキュリティ設定
  // ============================================================================

  /**
   * プライバシー保護モード
   *
   * @default 'normal'
   * @description
   * - normal: メールアドレスを部分的にマスク (例: u***@example.com)
   * - strict: メールアドレスを完全にマスク (例: ***@***)
   */
  PRIVACY_PROTECTION_MODE?: PrivacyMode;

  // ============================================================================
  // 外部サービス - GitHub
  // ============================================================================

  /**
   * GitHub Personal Access Token
   *
   * @required コンタクトフォームを使用する場合は必須
   * @scope 'repo' (プライベートリポジトリの場合) または 'public_repo'
   */
  GITHUB_TOKEN?: string;

  /**
   * GitHub リポジトリ (owner/repo 形式)
   *
   * @default 't3-nico/dayopt-web'
   * @example 'your-org/your-repo'
   */
  GITHUB_CONTACT_REPO?: string;

  // ============================================================================
  // 外部サービス - Upstash (Rate Limiting)
  // ============================================================================

  /**
   * Upstash Redis REST API URL
   *
   * @description レート制限機能を使用する場合は設定してください
   * @optional 未設定の場合はメモリベースのレート制限にフォールバック
   */
  UPSTASH_REDIS_REST_URL?: string;

  /**
   * Upstash Redis REST API Token
   *
   * @description レート制限機能を使用する場合は設定してください
   * @optional 未設定の場合はメモリベースのレート制限にフォールバック
   */
  UPSTASH_REDIS_REST_TOKEN?: string;

  // ============================================================================
  // 外部サービス - Cloudflare Turnstile (bot対策)
  // ============================================================================

  /**
   * Cloudflare Turnstile site key (public)
   *
   * @description contact form の bot 検証 widget に使用。ブラウザ側で読み込まれる
   * @required Production環境でコンタクトフォームを使う場合
   */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;

  /**
   * Cloudflare Turnstile secret key (server-only)
   *
   * @description siteverify endpoint への検証 POST に使用
   * @required Production環境でコンタクトフォームを使う場合
   */
  TURNSTILE_SECRET_KEY?: string;

  // ============================================================================
  // SEO - 検索エンジン検証
  // ============================================================================

  /**
   * Google Search Console 検証コード
   *
   * @optional SEO設定用
   */
  GOOGLE_SITE_VERIFICATION?: string;

  /**
   * Yandex Webmaster 検証コード
   *
   * @optional SEO設定用
   */
  YANDEX_VERIFICATION?: string;

  /**
   * Yahoo! Search 検証コード
   *
   * @optional SEO設定用
   */
  YAHOO_VERIFICATION?: string;
}

/**
 * 環境変数の検証エラー
 */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(`Environment Variable Validation Error: ${message}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * 文字列を NodeEnv 型に変換
 */
function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === 'production' || value === 'development' || value === 'test') {
    return value;
  }
  return 'development';
}

/**
 * 文字列を PrivacyMode 型に変換
 */
function parsePrivacyMode(value: string | undefined): PrivacyMode {
  if (value === 'strict') {
    return 'strict';
  }
  return 'normal';
}

/**
 * 文字列を boolean に変換
 */
function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value ? true : undefined;
}

/**
 * 必須環境変数のチェック
 */
function validateRequiredEnv(env: Partial<EnvConfig>): void {
  // CI環境ではビルドチェックのみなのでスキップ
  if (env.CI) {
    return;
  }

  const errors: string[] = [];

  // Production環境では NEXT_PUBLIC_APP_URL が必須
  if (env.NODE_ENV === 'production' && !env.NEXT_PUBLIC_APP_URL && !env.VERCEL_URL) {
    errors.push('NEXT_PUBLIC_APP_URL or VERCEL_URL is required in production environment');
  }

  // コンタクトフォームを使用する場合は GITHUB_TOKEN が必須
  // （開発環境では警告のみ）
  if (!env.GITHUB_TOKEN) {
    const message = 'GITHUB_TOKEN is not set. Contact form will not work.';
    if (env.NODE_ENV === 'production') {
      errors.push(message);
    } else {
      console.warn(`[ENV WARNING] ${message}`);
    }
  }

  // Turnstile設定の一貫性チェック
  const hasTurnstileSite = !!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const hasTurnstileSecret = !!env.TURNSTILE_SECRET_KEY;
  if (hasTurnstileSite !== hasTurnstileSecret) {
    const message =
      'Both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY should be set together.';
    if (env.NODE_ENV === 'production') {
      errors.push(message);
    } else {
      console.warn(`[ENV WARNING] ${message}`);
    }
  }

  // Upstash設定チェック
  const hasUpstashUrl = !!env.UPSTASH_REDIS_REST_URL;
  const hasUpstashToken = !!env.UPSTASH_REDIS_REST_TOKEN;

  if (hasUpstashUrl !== hasUpstashToken) {
    const message =
      'Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN should be set together.';
    if (env.NODE_ENV === 'production') {
      errors.push(message);
    } else {
      console.warn(`[ENV WARNING] ${message}`);
    }
  }

  // Production では Upstash が両方必須（未設定時は rate limit が pass-through で無効化される）
  if (env.NODE_ENV === 'production' && (!hasUpstashUrl || !hasUpstashToken)) {
    errors.push(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production (rate limit becomes pass-through without them)',
    );
  }

  if (errors.length > 0) {
    throw new EnvValidationError(`\n${errors.map((err) => `  - ${err}`).join('\n')}`);
  }
}

/**
 * 環境変数を読み込み、型安全なオブジェクトとして返す
 *
 * @throws {EnvValidationError} 必須の環境変数が未設定の場合
 */
export function loadEnv(): EnvConfig {
  const rawEnv = process.env;

  const env: EnvConfig = {
    // Node.js 環境
    NODE_ENV: parseNodeEnv(rawEnv.NODE_ENV),
    CI: parseBoolean(rawEnv.CI),

    // アプリケーション設定
    NEXT_PUBLIC_APP_URL: rawEnv.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: rawEnv.NEXT_PUBLIC_SITE_URL,
    VERCEL_URL: rawEnv.VERCEL_URL,

    // セキュリティ設定
    PRIVACY_PROTECTION_MODE: parsePrivacyMode(rawEnv.PRIVACY_PROTECTION_MODE),

    // GitHub
    GITHUB_TOKEN: rawEnv.GITHUB_TOKEN,
    GITHUB_CONTACT_REPO: rawEnv.GITHUB_CONTACT_REPO,

    // Upstash
    UPSTASH_REDIS_REST_URL: rawEnv.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: rawEnv.UPSTASH_REDIS_REST_TOKEN,

    // Cloudflare Turnstile
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: rawEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: rawEnv.TURNSTILE_SECRET_KEY,

    // SEO
    GOOGLE_SITE_VERIFICATION: rawEnv.GOOGLE_SITE_VERIFICATION,
    YANDEX_VERIFICATION: rawEnv.YANDEX_VERIFICATION,
    YAHOO_VERIFICATION: rawEnv.YAHOO_VERIFICATION,
  };

  // バリデーション実行
  validateRequiredEnv(env);

  return env;
}

/**
 * 型安全な環境変数オブジェクト
 *
 * @description
 * アプリケーション全体で使用する環境変数。
 * 起動時にバリデーションが実行されます。
 */
export const env = loadEnv();

/**
 * 開発環境かどうかを判定
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * 本番環境かどうかを判定
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * テスト環境かどうかを判定
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * CI環境かどうかを判定
 */
export const isCI = env.CI === true;

/**
 * アプリケーションのベースURL
 *
 * @description
 * 優先順位:
 * 1. NEXT_PUBLIC_APP_URL
 * 2. VERCEL_URL (https:// プレフィックス付与)
 * 3. デフォルト値 (開発: localhost:3000, 本番: https://dayopt.app)
 */
export const getAppUrl = (): string => {
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL;
  }

  if (env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`;
  }

  if (isDevelopment) {
    return 'http://localhost:3000';
  }

  return 'https://dayopt.app';
};

/**
 * サイトのURL（SEO用）
 */
export const getSiteUrl = (): string => {
  return env.NEXT_PUBLIC_SITE_URL || getAppUrl();
};
