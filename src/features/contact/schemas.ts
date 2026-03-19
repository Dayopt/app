/**
 * Contact Form バリデーションスキーマ
 */

import { z } from 'zod';

/** お問い合わせカテゴリのZodスキーマ（Web側と統一） */
export const contactCategorySchema = z.enum(['bug', 'feature', 'question', 'other']);

/** クライアントから自動収集する環境情報のZodスキーマ */
export const contactEnvironmentSchema = z.object({
  appVersion: z.string(),
  os: z.string(),
  browser: z.string(),
  timezone: z.string(),
  language: z.string(),
});

/** お問い合わせフォーム全体のZodスキーマ */
export const contactFormSchema = z.object({
  category: contactCategorySchema,
  message: z.string().min(10).max(5000),
  environment: contactEnvironmentSchema,
});
