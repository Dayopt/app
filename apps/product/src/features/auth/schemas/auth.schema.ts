import { z } from 'zod';

import type { MessageKey } from '@/lib/i18n';

/**
 * 認証フォームのスキーマ
 *
 * バリデーションメッセージは i18n キーで保持し、表示側で `t(message)` により解決する
 * （sanitize-auth-error の getAuthErrorKey → t(errorKey) と同じイディオム）。
 *
 * 各 message は `satisfies MessageKey` でキーの実在を検証している。zod の
 * `.min()` / `.email()` 自体は message を素の string としてしか受け取らないため、
 * ここで検証しないと react-hook-form 経由で widen された string になった時点では
 * もう typo を検出できない（表示側は resolve-schema-message-key.ts を参照）。
 */

const emailRequired = 'auth.errors.emailRequired' satisfies MessageKey;
const emailInvalid = 'auth.errors.emailInvalid' satisfies MessageKey;
const passwordRequired = 'auth.errors.passwordRequired' satisfies MessageKey;
const weakPassword = 'auth.errors.weakPassword' satisfies MessageKey;
const passwordTooLong = 'auth.errors.passwordTooLong' satisfies MessageKey;

/**
 * ログインフォームのスキーマ
 */
export const loginSchema = z.object({
  email: z.string().min(1, emailRequired).email(emailInvalid),
  password: z.string().min(1, passwordRequired),
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
export const passwordSchema = z.string().min(8, weakPassword).max(64, passwordTooLong);

/**
 * サインアップフォームのスキーマ
 */
export const signupSchema = z.object({
  email: z.string().min(1, emailRequired).email(emailInvalid),
  password: passwordSchema,
});

/** サインアップフォームの入力データ型 */
export type SignupFormData = z.infer<typeof signupSchema>;
