/**
 * Contact Feature 型定義
 */

import type { z } from 'zod';

import type { contactCategorySchema, contactEnvironmentSchema, contactFormSchema } from './schemas';

/** お問い合わせカテゴリ型 */
export type ContactCategory = z.infer<typeof contactCategorySchema>;
/** クライアント環境情報型 */
export type ContactEnvironment = z.infer<typeof contactEnvironmentSchema>;
/** お問い合わせフォーム入力型 */
export type ContactFormInput = z.infer<typeof contactFormSchema>;
