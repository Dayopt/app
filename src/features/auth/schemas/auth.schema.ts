import { z } from 'zod';

/**
 * ログインフォームのスキーマ
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('有効なメールアドレスを入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * パスワードスキーマ
 *
 * 要件: 8文字以上64文字以内、英字・数字を含む。
 * config.toml の password_requirements = "letters_digits" と一致。
 * 構成ルールのバリデーションは auth-config.ts の validatePassword() で実施。
 */
export const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上で入力してください')
  .max(64, 'パスワードは64文字以内で入力してください');

/**
 * サインアップフォームのスキーマ
 */
export const signupSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('有効なメールアドレスを入力してください'),
  password: passwordSchema,
});

export type SignupFormData = z.infer<typeof signupSchema>;
