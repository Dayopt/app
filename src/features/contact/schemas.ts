/**
 * Contact Form バリデーションスキーマ
 */

import { z } from 'zod';

/** Web側と統一 */
export const contactCategorySchema = z.enum(['bug', 'feature', 'question', 'other']);

/** クライアントから自動収集する環境情報 */
export const contactEnvironmentSchema = z.object({
  appVersion: z.string(),
  os: z.string(),
  browser: z.string(),
  timezone: z.string(),
  language: z.string(),
});

export const contactFormSchema = z.object({
  category: contactCategorySchema,
  message: z.string().min(10).max(5000),
  environment: contactEnvironmentSchema,
});
