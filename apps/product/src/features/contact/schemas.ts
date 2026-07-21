/**
 * Contact Form バリデーションスキーマ
 */

import { z } from 'zod';

/** お問い合わせカテゴリのZodスキーマ（Web側と統一） */
export const contactCategorySchema = z.enum(['bug', 'feature', 'question', 'other']);

/** クライアントから自動収集する環境情報のZodスキーマ */
export const contactEnvironmentSchema = z
  .object({
    appVersion: z.string().max(64),
    os: z.string().max(128),
    browser: z.string().max(256),
    timezone: z.string().max(128),
    language: z.string().max(64),
  })
  .strict();

/** お問い合わせフォーム全体のZodスキーマ */
export const contactFormSchema = z
  .object({
    submissionId: z.string().uuid(),
    category: contactCategorySchema,
    message: z.string().min(10).max(5000),
    environment: contactEnvironmentSchema,
  })
  .strict();
