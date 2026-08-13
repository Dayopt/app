/**
 * Auth エラーメッセージのサニタイズ
 *
 * OWASP ユーザー列挙防止:
 * Supabase の生エラーメッセージには「User already registered」「Email not confirmed」等、
 * アカウントの存在を推測できる情報が含まれる。
 * このユーティリティは全エラーを安全な i18n キーにマッピングする。
 *
 * 元々 features/auth/lib/sanitize-auth-error.ts に定義されていたが、
 * useAuthStore が @/stores/ に移動したため、共有レイヤーに移動。
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 */

import type { MessageKey } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { SupabaseConfigError } from '@/lib/supabase/client';

type AuthContext = 'login' | 'signup' | 'resetPassword' | 'updatePassword' | 'oauth';

/** getAuthErrorKey への入力。code は AuthError.code（構造化エラーコード）を渡す */
interface AuthErrorInput {
  message: string;
  code?: string | undefined;
}

/**
 * 既に解決済みの i18n キー（resolveAuthErrorKey の戻り値）。
 * LoginForm 等の呼び出し元コンポーネントが `signInError.message` を再度
 * getAuthErrorKey に通すため（e.g. LoginForm.tsx:117）、ここに含まれるキーは
 * context に関わらずそのまま返す（login context の「非rate-limitは全て
 * invalidCredentialsに丸める」ルールに巻き込まれて意味が変わるのを防ぐ）。
 * 新キーを足す時は、同じ二重解決経路（store の catch → 呼び出し元コンポーネントの
 * 再解決）を通るキーをここにも足すこと。忘れると別のキーへ黙って化ける。
 */
export const RESOLVED_KEYS = [
  'auth.errors.unexpectedError',
  'auth.errors.signupUnavailable',
  'auth.errors.captchaFailed',
  'auth.errors.accountLocked',
  'auth.errors.tooManyRequests',
  'auth.errors.weakPassword',
  'auth.errors.invalidCredentials',
] as const satisfies readonly MessageKey[];

/**
 * Supabase の AuthError メッセージを安全な i18n キーに変換
 *
 * 原則:
 * - login: 常に「メールアドレスまたはパスワードが正しくありません」を返す
 * - signup: ユーザーの存在を漏洩しない汎用メッセージを返す（既登録・未分類の失敗を同一キーに
 *   収束させる。分岐ごとに違う文言を返すと、その文言差自体が enumeration oracle になる）
 * - resetPassword: 常に成功メッセージ（Supabase 側で処理済み）
 */
export function getAuthErrorKey(error: AuthErrorInput, context: AuthContext): MessageKey {
  const { message: errorMessage, code } = error;

  // RESOLVED_KEYS に含まれる場合、呼び出し元は既に解決済みの i18n キーを
  // errorMessage として渡している（上記コメント参照）。errorMessage は素の string で
  // literal 型を持たないため、find で「一致した要素そのもの」を返して MessageKey 型を保つ。
  // 一致した literal を返すので、RESOLVED_KEYS にキーを足しても対応は自動で正しいままになる
  // （特定 literal を決め打ちで返すと、2 つ目のキーを足した瞬間に別のキーへ化ける）。
  const alreadyResolved = RESOLVED_KEYS.find((key) => key === errorMessage);
  if (alreadyResolved !== undefined) {
    return alreadyResolved;
  }

  // captcha 検証失敗は Turnstile/hCaptcha の provider 側文言に依存し message が不安定なため、
  // 構造化 code を最優先で判定する（message substring より前）。全 context 共通
  // （#2031: GoTrue に設定された Turnstile secret 自体が無効だと signup/login/resetPassword
  // すべてで発生する。login の catch-all 分岐に飲まれないよう context 判定より手前に置く）
  if (code === 'captcha_failed') {
    return 'auth.errors.captchaFailed';
  }

  const normalizedMessage = errorMessage.toLowerCase();

  // ログイン: 具体的な理由を開示しない（OWASP準拠）
  if (context === 'login') {
    // レート制限系は具体的に伝えてOK（攻撃者にも知らせるべき）
    if (
      normalizedMessage.includes('rate limit') ||
      normalizedMessage.includes('too many requests')
    ) {
      return 'auth.errors.accountLocked';
    }
    // それ以外は全て「メールアドレスまたはパスワードが正しくありません」
    return 'auth.errors.invalidCredentials';
  }

  // サインアップ
  if (context === 'signup') {
    // OWASP: 既登録かどうかで応答を変えない。structured code（GoTrue の ErrorCode）を優先し、
    // message substring は code が無い場合の fallback とする
    if (
      code === 'email_exists' ||
      code === 'user_already_exists' ||
      code === 'identity_already_exists' ||
      normalizedMessage.includes('already registered') ||
      normalizedMessage.includes('already exists') ||
      normalizedMessage.includes('duplicate')
    ) {
      return 'auth.errors.signupUnavailable';
    }
    if (
      normalizedMessage.includes('rate limit') ||
      normalizedMessage.includes('too many requests')
    ) {
      return 'auth.errors.tooManyRequests';
    }
    if (normalizedMessage.includes('password') && normalizedMessage.includes('weak')) {
      return 'auth.errors.weakPassword';
    }
    // 未分類の失敗も同じキーへ収束させる（上の既登録分岐と同一文言にすることで、
    // 文言差そのものが oracle になるのを防ぐ）
    return 'auth.errors.signupUnavailable';
  }

  // パスワード更新
  if (context === 'updatePassword') {
    if (normalizedMessage.includes('weak') || normalizedMessage.includes('short')) {
      return 'auth.errors.weakPassword';
    }
    return 'auth.errors.unexpectedError';
  }

  // OAuth, resetPassword, その他
  return 'auth.errors.unexpectedError';
}

/**
 * catch(err) で受けた例外を安全な i18n キーに変換する。
 *
 * SupabaseConfigError（env未設定/placeholderのまま起動）はユーザーの入力とは無関係な
 * システム設定の問題であり、getAuthErrorKey の OWASP サニタイズ（例: login context を
 * 全て「invalidCredentials」に丸める）を通すと「メールアドレスまたはパスワードが正しく
 * ありません」に化けて原因が分からなくなる。RESOLVED_KEYS の一つを返すことで、呼び出し元
 * コンポーネントが再度 getAuthErrorKey に通しても意味が変わらないようにする。
 * 実メッセージ（env未設定の詳細）は logger.error で常に出力する。
 */
export function resolveAuthErrorKey(err: unknown, context: AuthContext): MessageKey {
  if (err instanceof SupabaseConfigError) {
    logger.error('[Auth] Supabase設定エラー:', err.message);
    return 'auth.errors.unexpectedError';
  }
  const code =
    err !== null && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
      ? err.code
      : undefined;
  return getAuthErrorKey({ message: err instanceof Error ? err.message : '', code }, context);
}
