/**
 * MDXフロントマターの Zod バリデーションスキーマ
 *
 * 型キャスト（`data as T`）を排除し、ビルド時・ランタイムのバリデーションを提供する。
 */

import { z } from 'zod';

// === AI/RAG メタデータスキーマ ===

const aiMetadataSchema = z
  .object({
    relatedQuestions: z.array(z.string()).optional(),
    prerequisites: z.array(z.string()).optional(),
    relatedDocs: z.array(z.string()).optional(),
    chunkStrategy: z.enum(['h2', 'h3', 'paragraph', 'full']).optional(),
    searchable: z.boolean().optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    contentType: z
      .enum(['tutorial', 'reference', 'guide', 'troubleshooting', 'concept'])
      .optional(),
  })
  .optional();

// === ブログ記事フロントマター ===

export const blogFrontMatterSchema = z.object({
  title: z.string().min(1, 'title は必須です'),
  description: z.string().default(''),
  publishedAt: z.string().min(1, 'publishedAt は必須です'),
  updatedAt: z.string().optional(),
  tags: z.array(z.string()).default([]),
  category: z.string().default('general'),
  author: z.string().default('Dayopt Team'),
  authorAvatar: z.string().optional(),
  coverImage: z.string().optional(),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
  readingTime: z.number().optional(),
  ai: aiMetadataSchema,
});

export type BlogFrontMatter = z.infer<typeof blogFrontMatterSchema>;

// === リリースノートフロントマター ===

export const releaseFrontMatterSchema = z.object({
  version: z.string().min(1, 'version は必須です'),
  date: z.string().min(1, 'date は必須です'),
  title: z.string().default(''),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  breaking: z.boolean().default(false),
  featured: z.boolean().default(false),
  prerelease: z.boolean().optional(),
  author: z.string().optional(),
  authorAvatar: z.string().optional(),
  coverImage: z.string().optional(),
  ai: aiMetadataSchema,
});

export type ReleaseFrontMatter = z.infer<typeof releaseFrontMatterSchema>;

// === ドキュメントフロントマター ===

export const docFrontMatterSchema = z.object({
  title: z.string().default('Untitled'),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  slug: z.string().default(''),
  category: z.string().default('general'),
  order: z.number().default(0),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
  ai: aiMetadataSchema,
});

export type DocFrontMatter = z.infer<typeof docFrontMatterSchema>;

// === パースヘルパー ===

/**
 * フロントマターを安全にパースする。
 * バリデーションエラー時は警告ログを出力し、デフォルト値で補完したオブジェクトを返す。
 */
export function parseFrontMatter<T>(
  schema: z.ZodType<T>,
  data: Record<string, unknown>,
  filePath: string,
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.warn(`[Content] フロントマターバリデーション警告 (${filePath}):\n${issues}`);

    // エラーがあってもデフォルト値で補完して返す（後方互換性のため）
    // strict な失敗にしたい場合は throw に変更可能
    return schema.parse({
      ...data,
      // 必須フィールドのフォールバック
      title: data.title || 'Untitled',
      description: data.description || '',
    });
  }

  return result.data;
}
