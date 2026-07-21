import { SUPPORTED_LOCALES } from '@dayopt/config';
import type { Locale } from '@dayopt/i18n/routing';
import matter from 'gray-matter';
import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { z } from 'zod';

export const LEGAL_DOCUMENT_SLUGS = [
  'privacy',
  'terms',
  'cookies',
  'tokushoho',
  'security',
] as const;

export type LegalDocumentSlug = (typeof LEGAL_DOCUMENT_SLUGS)[number];

const legalFrontMatterSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    lastUpdated: z.string().min(1),
  })
  .strict();

export type LegalDocumentFrontMatter = z.infer<typeof legalFrontMatterSchema>;

export interface LegalDocumentContent {
  frontMatter: LegalDocumentFrontMatter;
  content: string;
}

const LEGAL_CONTENT_DIR = path.join(process.cwd(), 'content', 'legal');

export function readLegalDocumentFile(filePath: string): LegalDocumentContent {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Legal] Missing legal content: ${filePath}`);
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(source);
  const frontMatter = legalFrontMatterSchema.parse(data);

  if (!content.trim()) {
    throw new Error(`[Legal] Empty legal content: ${filePath}`);
  }

  return { frontMatter, content };
}

export const getLegalDocument = cache(function getLegalDocumentImpl(
  locale: Locale,
  slug: LegalDocumentSlug,
): LegalDocumentContent {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new Error(`[Legal] Unsupported locale: ${locale}`);
  }

  return readLegalDocumentFile(path.join(LEGAL_CONTENT_DIR, locale, `${slug}.mdx`));
});
