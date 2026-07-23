/**
 * ビルド時に検索インデックスJSONを生成するスクリプト
 *
 * 全コンテンツ（blog, docs）を読み込み、
 * public/search-index.json に出力する。
 * CDN経由で配信可能になり、APIルートへのリクエストが不要になる。
 *
 * 使用方法: tsx scripts/generate-search-index.ts
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@dayopt/config';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';

import type { SearchIndexEntry } from '../src/features/search/lib/search-index';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'search-index.json');

/**
 * 本文からインデックスへ載せる文字数の上限。
 * 全文を載せるとインデックスが肥大するため、導入部と主要セクションが入る長さで切る。
 */
const CONTENT_LIMIT = 2000;

// localePrefix: 'as-needed' のため defaultLocale は prefix なし、それ以外は `/{locale}` を前置する
function localizedUrl(locale: string, pathname: string): string {
  return locale === DEFAULT_LOCALE ? pathname : `/${locale}${pathname}`;
}

/**
 * Markdownからプレーンテキストを抽出（検索用）
 */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ディレクトリ内のMDXファイルを再帰的に取得
 */
function getMdxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getMdxFiles(fullPath));
    } else if (item.name.endsWith('.mdx')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * ブログ記事をインデックスに追加
 */
function indexBlog(locale: string): SearchIndexEntry[] {
  const blogDir = path.join(CONTENT_DIR, 'blog', locale);
  const entries: SearchIndexEntry[] = [];

  for (const filePath of getMdxFiles(blogDir)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data, content: body } = matter(content);

      if (data.draft) continue;

      const slug = path.basename(filePath, '.mdx');
      entries.push({
        id: `blog-${locale}-${slug}`,
        title: (data.title as string) || '',
        description: (data.description as string) || '',
        content: stripMarkdown(body).slice(0, CONTENT_LIMIT),
        url: localizedUrl(locale, `/blog/${slug}`),
        type: 'blog',
        tags: (data.tags as string[]) || [],
        category: (data.category as string) || 'general',
        date: (data.publishedAt as string) || '',
      });
    } catch (err) {
      console.error(`[SearchIndex] Failed to index blog: ${filePath}`, err);
    }
  }

  return entries;
}

/**
 * ドキュメントをインデックスに追加
 */
function indexDocs(locale: string): SearchIndexEntry[] {
  const docsDir = path.join(CONTENT_DIR, 'docs', locale);
  const entries: SearchIndexEntry[] = [];

  for (const filePath of getMdxFiles(docsDir)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data, content: body } = matter(content);

      if (data.draft) continue;

      // 公開 URL はフラット1階層（src/lib/mdx.ts と同じ規則）。
      // ディレクトリ付きの相対パスを使うと実在しない URL を検索結果に出してしまう
      const relativePath = path.relative(docsDir, filePath).replace(/\\/g, '/');
      const category = relativePath.split('/')[0] || 'general';
      const fileName = path.basename(filePath, '.mdx');
      const slug = fileName === 'index' ? category : fileName;
      const plainBody = stripMarkdown(body);

      entries.push({
        id: `docs-${locale}-${slug}`,
        title: (data.title as string) || '',
        description: (data.description as string) || plainBody.slice(0, 200),
        content: plainBody.slice(0, CONTENT_LIMIT),
        url: localizedUrl(locale, `/docs/${slug}`),
        type: 'docs',
        tags: (data.tags as string[]) || [],
        category: (data.category as string) || category,
        date: (data.publishedAt as string) || (data.updatedAt as string) || '',
      });
    } catch (err) {
      console.error(`[SearchIndex] Failed to index doc: ${filePath}`, err);
    }
  }

  return entries;
}

// メイン処理
function main() {
  console.log('[SearchIndex] 検索インデックス生成を開始...');

  const locales = SUPPORTED_LOCALES;
  const index: Record<string, SearchIndexEntry[]> = {};

  for (const locale of locales) {
    const entries = [...indexBlog(locale), ...indexDocs(locale)];
    index[locale] = entries;
    console.log(`[SearchIndex] ${locale}: ${entries.length} エントリ`);
  }

  // public/ に出力
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index), 'utf-8');

  const totalEntries = Object.values(index).reduce((sum, entries) => sum + entries.length, 0);
  const fileSize = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
  console.log(`[SearchIndex] 完了: ${totalEntries} エントリ, ${fileSize}KB → ${OUTPUT_PATH}`);
}

main();
