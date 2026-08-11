import 'server-only';

/**
 * アカウント削除の本人確認（パスワード再認証）
 *
 * ⚠ このモジュールは **captcha を意図的に免除している**（#1925）。
 *
 * - service-role client の `Authorization` を GoTrue が admin role として解釈するため、
 *   `verifyCaptcha` が skip される。これが免除の仕組みそのもの
 * - **この endpoint の将来の captcha 強化も、ここでは効かない**。
 *   Supabase の Bot Protection 設定を変えてもこの経路は影響を受けないので、
 *   captcha に依存した対策をここに期待しない
 * - なぜ captcha を足す方式（削除ダイアログに Turnstile を載せる）を採らなかったかは
 *   `docs/product/specs/auth.md` の設定画面の本人確認と保証境界を参照
 *
 * ## client の扱い（契約）
 *
 * supabase-js の client は `signInWithPassword` が成功した時点で auth state が切り替わり、
 * 以後の PostgREST / Storage 呼び出しが **service_role から当該ユーザー権限へ降格する**。
 * そのため:
 *
 * - client は**呼び出しごとに生成**する。module スコープや singleton に保持しない
 * - client を**返さない・外へ漏らさない・他の操作に使わない**
 *
 * これを破ると、warm container 上で以後の admin 操作が他ユーザーのトークンで走る。
 *
 * ## 依存
 *
 * `SUPABASE_SERVICE_ROLE_KEY` が **legacy JWT 形式**であること。新形式（`sb_secret_`）は
 * Bearer として送られないため admin と解釈されず、captcha 免除が成立しなくなる
 * （その場合は削除が fail-closed で止まる。鍵の回転前に再検証すること）。
 */

import { captureUnexpectedError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

/**
 * alert を鳴らさない GoTrue error code。
 *
 * ユーザー起因・環境起因で正常に起こりうるものだけを列挙する。ここに無いものは
 * 構成故障として扱い canary を鳴らす（既定を fail-loud にする）。
 *
 * `lib/sentry` の `EXPECTED_AUTH_ERROR_CODES` は流用できない。あちらは
 * 「Sentry issue にしない」集合で、`captcha_failed` や `bad_jwt`（＝まさに検出したい
 * 構成故障）がユーザー起因の code と同居しているため。
 */
const NON_ALERTING_ERROR_CODES = new Set([
  'email_not_confirmed',
  'user_banned',
  'over_request_rate_limit',
]);

/** GoTrue の rate limit。サーバー呼び出しなので egress IP を全ユーザーで共有する点に注意 */
const RATE_LIMITED_STATUS = 429;

type PasswordReauthenticationResult =
  /** パスワードが一致した */
  | { outcome: 'verified' }
  /** ユーザーが入力したパスワードが違う */
  | { outcome: 'invalid_password' }
  /** 検証手段そのものが使えない（構成故障・レート制限など）。削除は通さない */
  | { outcome: 'unavailable' };

interface VerifyPasswordInput {
  /** server 側の session から取得したアドレス。クライアント入力を渡さないこと */
  email: string;
  password: string;
}

/**
 * captcha を迂回してパスワードを検証する。
 *
 * 呼び出しはアカウント削除フローの 1 箇所のみ。増やす場合は上記の契約と
 * `docs/product/specs/auth.md` の保証境界を先に読むこと。
 */
export async function verifyPasswordWithCaptchaBypass({
  email,
  password,
}: VerifyPasswordInput): Promise<PasswordReauthenticationResult> {
  // 呼び出しごとに生成する。返さない・使い回さない（上記の契約）
  const adminClient = createServiceRoleClient();

  // observeAuthOperation では包まない。構成故障は下の captureUnexpectedError で
  // 1 本に集約し、同一事象で Sentry issue が二重に立つのを避ける
  const { error } = await adminClient.auth.signInWithPassword({ email, password });

  if (!error) {
    // 検証のためだけに発行された session を残さない。削除まで到達すれば CASCADE で
    // 消えるが、後段（beforeIdentityDeletion の contention 等）で中断すると
    // 有効な refresh token だけが孤児として残る。
    //
    // scope の明示は必須。省略時の既定は 'global' で、**ユーザーの全端末が強制
    // ログアウトされる**（削除が中断した場合、巻き添えでログアウトだけが起きる）
    try {
      await adminClient.auth.signOut({ scope: 'local' });
    } catch {
      // 後始末の失敗で削除を止めない
    }
    return { outcome: 'verified' };
  }

  if (error.code === 'invalid_credentials') return { outcome: 'invalid_password' };

  const isNonAlerting =
    (error.code !== undefined && NON_ALERTING_ERROR_CODES.has(error.code)) ||
    error.status === RATE_LIMITED_STATUS;
  if (isNonAlerting) return { outcome: 'unavailable' };

  // ここに来るのは captcha_failed / bad_jwt / 未知の code。いずれも迂回が
  // 壊れたことを示すので alert に乗せる（captureUnexpectedError は
  // isExpectedAuthError を経由せず無条件に Sentry へ送る）
  captureUnexpectedError(
    new Error('Account deletion reauthentication unavailable', { cause: error }),
    {
      feature: 'account_deletion',
      operation: 'delete_account_reauthenticate',
      source: 'captcha_bypass',
    },
  );

  return { outcome: 'unavailable' };
}
