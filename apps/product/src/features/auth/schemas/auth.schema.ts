import { z } from 'zod';

/**
 * 認証フォームのスキーマ
 *
 * バリデーションメッセージは i18n キーで保持し、表示側で `t(message)` により解決する
 * （sanitize-auth-error の getAuthErrorKey → t(errorKey) と同じイディオム）。
 */

/**
 * ログインフォームのスキーマ
 */
export const loginSchema = z.object({
  email: z.string().min(1, 'auth.errors.emailRequired').email('auth.errors.emailInvalid'),
  password: z.string().min(1, 'auth.errors.passwordRequired'),
});

/** ログインフォームの入力データ型 */
export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * パスワードスキーマ
 *
 * 要件: 8文字以上64文字以内、英字・数字を含む。
 * config.toml の minimum_password_length = 8 / password_requirements = "letters_digits" と一致。
 * 構成ルール（英数字必須）のバリデーションは Supabase 側で実施。
 * signup / パスワードリセット / パスワード変更のすべてでこのスキーマを使う。
 */
export const passwordSchema = z
  .string()
  .min(8, 'auth.errors.weakPassword')
  .max(64, 'auth.errors.passwordTooLong');

/**
 * サインアップフォームのスキーマ
 */
export const signupSchema = z.object({
  email: z.string().min(1, 'auth.errors.emailRequired').email('auth.errors.emailInvalid'),
  password: passwordSchema,
});

/** サインアップフォームの入力データ型 */
export type SignupFormData = z.infer<typeof signupSchema>;
