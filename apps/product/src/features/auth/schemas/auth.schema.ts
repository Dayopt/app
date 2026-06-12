import { z } from 'zod';

/**
 * ログインフォームのスキーマ
 */
export const loginSchema = z.object({
  email: z.string().min(1, 'メールアドレスを入力').email('有効なメールアドレスを入力'),
  password: z.string().min(1, 'パスワードを入力'),
});

/** ログインフォームの入力データ型 */
export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * パスワードスキーマ
 *
 * 要件: 8文字以上64文字以内、英字・数字を含む。
 * config.toml の password_requirements = "letters_digits" と一致。
 * 構成ルールのバリデーションは Supabase config.toml 側で実施。
 */
const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上で入力')
  .max(64, 'パスワードは64文字以内で入力');

/**
 * サインアップフォームのスキーマ
 */
export const signupSchema = z.object({
  email: z.string().min(1, 'メールアドレスを入力').email('有効なメールアドレスを入力'),
  password: passwordSchema,
});

/** サインアップフォームの入力データ型 */
export type SignupFormData = z.infer<typeof signupSchema>;
