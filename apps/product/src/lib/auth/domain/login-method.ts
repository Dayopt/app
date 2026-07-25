/**
 * ログイン手段（Supabase auth identity provider）の判定
 *
 * Google でサインアップしたユーザーはパスワードを持たない。これは正常な状態なので、
 * パスワードを前提にした UI や再認証を全員に強制しないための判定に使う。
 *
 * 判定には `app_metadata.providers` を使う。`user.identities` は session 由来の
 * user オブジェクトに含まれないことがあり、判定が不安定になるため使わない。
 *
 * NOTE: ここでいう identity は Supabase Auth の認証 identity。アプリ内部の
 * `ProductIdentity`（userId / role / subscriptionStatus）とは別概念。
 */

/** 判定に必要な最小の user 形。Supabase の `User` をそのまま渡せる */
type UserWithProviders = {
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
};

/** メール+パスワードの identity を持つか（= パスワードで再認証できるか） */
export function hasPasswordIdentity(user: UserWithProviders | null | undefined): boolean {
  if (!user) return false;

  const { providers, provider } = user.app_metadata ?? {};
  if (providers && providers.length > 0) return providers.includes('email');

  // providers が無い古いセッションは provider 単体にフォールバックする
  return provider === 'email';
}
