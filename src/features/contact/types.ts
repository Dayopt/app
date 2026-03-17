/**
 * Contact Feature 型定義
 */

import type { z } from 'zod';

import type { contactCategorySchema, contactEnvironmentSchema, contactFormSchema } from './schemas';

export type ContactCategory = z.infer<typeof contactCategorySchema>;
export type ContactEnvironment = z.infer<typeof contactEnvironmentSchema>;
export type ContactFormInput = z.infer<typeof contactFormSchema>;
