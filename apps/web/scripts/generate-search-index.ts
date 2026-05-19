/**
 * ビルド時に検索インデックスJSONを生成するスクリプト
 *
 * 全コンテンツ（blog, docs, releases）を読み込み、
 * public/search-index.json に出力する。
 * CDN経由で配信可能になり、APIルートへのリクエストが不要になる。
 *
 * 使用方法: tsx scripts/generate-search-index.ts
 */

import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';

interface SearchIndexEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  type: 'blog' | 'docs' | 'release';
  tags: string[];
  category: string;
  date: string;
}

const CONTENT_DIR = path.join(process.cwd(), 'content');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'search-index.json');

// routing.ts の defaultLocale と一致させる (localePrefix: 'as-needed' のため
// defaultLocale は prefix なし、それ以外は `/{locale}` を前置する)
const DEFAULT_LOCALE = 'en';

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
      const { data } = matter(content);

      if (data.draft) continue;

      const slug = path.basename(filePath, '.mdx');
      entries.push({
        id: `blog-${locale}-${slug}`,
        title: (data.title as string) || '',
        description: (data.description as string) || '',
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

      const relativePath = path.relative(docsDir, filePath);
      const slug = relativePath.replace(/\.mdx$/, '').replace(/\\/g, '/');

      entries.push({
        id: `docs-${locale}-${slug}`,
        title: (data.title as string) || '',
        description: (data.description as string) || stripMarkdown(body).slice(0, 200),
        url: localizedUrl(locale, `/docs/${slug}`),
        type: 'docs',
        tags: (data.tags as string[]) || [],
        category: (data.category as string) || slug.split('/')[0] || 'general',
        date: (data.publishedAt as string) || (data.updatedAt as string) || '',
      });
    } catch (err) {
      console.error(`[SearchIndex] Failed to index doc: ${filePath}`, err);
    }
  }

  return entries;
}

/**
 * リリースノートをインデックスに追加
 */
function indexReleases(locale: string): SearchIndexEntry[] {
  const releasesDir = path.join(CONTENT_DIR, 'releases', locale);
  const entries: SearchIndexEntry[] = [];

  for (const filePath of getMdxFiles(releasesDir)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(content);

      const slug = path.basename(filePath, '.mdx');
      const version = (data.version as string) || slug;

      entries.push({
        id: `release-${locale}-${slug}`,
        title: (data.title as string) || `Release ${version}`,
        description: (data.description as string) || '',
        url: localizedUrl(locale, `/releases/${version}`),
        type: 'release',
        tags: (data.tags as string[]) || [],
        category: 'releases',
        date: (data.date as string) || '',
      });
    } catch (err) {
      console.error(`[SearchIndex] Failed to index release: ${filePath}`, err);
    }
  }

  return entries;
}

// メイン処理
function main() {
  console.log('[SearchIndex] 検索インデックス生成を開始...');

  const locales = ['en', 'ja'];
  const index: Record<string, SearchIndexEntry[]> = {};

  for (const locale of locales) {
    const entries = [...indexBlog(locale), ...indexDocs(locale), ...indexReleases(locale)];
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
