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

import { SupabaseConfigError } from '@/lib/supabase/client';

type AuthContext = 'login' | 'signup' | 'resetPassword' | 'updatePassword' | 'oauth';

/**
 * Supabase の AuthError メッセージを安全な i18n キーに変換
 *
 * 原則:
 * - login: 常に「メールアドレスまたはパスワードが正しくありません」を返す
 * - signup: ユーザーの存在を漏洩しない汎用メッセージを返す
 * - resetPassword: 常に成功メッセージ（Supabase 側で処理済み）
 */
export function getAuthErrorKey(errorMessage: string, context: AuthContext): string {
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
    // OWASP: 「既に登録済み」もユーザー列挙防止のため汎用メッセージを返す
    if (
      normalizedMessage.includes('already registered') ||
      normalizedMessage.includes('already exists') ||
      normalizedMessage.includes('duplicate')
    ) {
      return 'auth.errors.unexpectedError';
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
    return 'auth.errors.unexpectedError';
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
 * ありません」に化けて原因が分からなくなる。dev環境限定で実メッセージをそのまま返す。
 */
export function resolveAuthErrorKey(err: unknown, context: AuthContext): string {
  if (err instanceof SupabaseConfigError && process.env.NODE_ENV === 'development') {
    return err.message;
  }
  return getAuthErrorKey(err instanceof Error ? err.message : '', context);
}
