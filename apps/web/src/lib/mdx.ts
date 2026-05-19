import type {
  ContentCategory,
  ContentCollection,
  ContentData,
  FrontMatter,
  SerializedContent,
} from '@/types/content';
import fs from 'fs';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';
import path from 'path';
import { cache } from 'react';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { docFrontMatterSchema, parseFrontMatter } from './content-schemas';

const CONTENT_PATH = path.join(process.cwd(), 'content/docs');

/** ロケールディレクトリ名（スキャン時に除外用） */
const LOCALE_DIRS = ['en', 'ja'];

/**
 * ロケールを考慮したコンテンツベースパスを取得
 */
function getLocalizedContentPath(locale?: string): string {
  if (locale) {
    return path.join(CONTENT_PATH, locale);
  }
  return CONTENT_PATH;
}

/**
 * 指定されたディレクトリからMDXファイルを取得
 */
export async function getMDXFiles(dir: string, locale?: string): Promise<string[]> {
  const basePath = getLocalizedContentPath(locale);
  const fullPath = path.join(basePath, dir);

  try {
    if (!fs.existsSync(fullPath)) {
      console.warn(`[MDX] Directory not found: ${fullPath}`);
      return [];
    }

    const files = fs.readdirSync(fullPath);
    return files.filter((file) => file.endsWith('.mdx'));
  } catch (error) {
    console.error(
      `[MDX] Failed to read directory: ${fullPath}`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * MDXファイルを読み込んでフロントマターとコンテンツを解析
 */
export async function getMDXContent(
  filePath: string,
  locale?: string,
): Promise<ContentData | null> {
  // Validate filePath to prevent path traversal
  if (!filePath || filePath.includes('..')) {
    console.warn(`[MDX] Invalid file path provided: ${filePath}`);
    return null;
  }

  const basePath = getLocalizedContentPath(locale);
  const fullPath = path.join(basePath, filePath);

  try {
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const fileContent = fs.readFileSync(fullPath, 'utf8');

    let parsedMatter: { data: Record<string, unknown>; content: string };
    try {
      parsedMatter = matter(fileContent);
    } catch (parseError) {
      console.error(
        `[MDX] Failed to parse frontmatter in: ${fullPath}`,
        parseError instanceof Error ? parseError.message : parseError,
      );
      return null;
    }

    const { data, content } = parsedMatter;

    // スラッグを生成（ファイルパスから、ロケールプレフィックスは含まない）
    const slug = filePath.replace(/\.mdx$/, '').replace(/\\/g, '/');

    // カテゴリーをパスから抽出
    const pathParts = filePath.split('/');
    const category = pathParts[0] || 'general';

    const parsed = parseFrontMatter(docFrontMatterSchema, { ...data, slug, category }, filePath);
    const frontMatter: FrontMatter = parsed;

    return {
      frontMatter,
      content,
      slug,
      path: filePath,
    };
  } catch (error) {
    console.error(
      `[MDX] Failed to read file: ${fullPath}`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * MDXコンテンツをシリアライズ（レンダリング用）
 */
export async function serializeMDX(content: string) {
  if (!content || typeof content !== 'string') {
    console.error('[MDX] Invalid content provided to serializeMDX');
    throw new Error('Invalid MDX content: content must be a non-empty string');
  }

  try {
    return await serialize(content, {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeHighlight],
        format: 'mdx',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[MDX] Failed to serialize MDX content:', errorMessage);
    throw new Error(`Failed to serialize MDX content: ${errorMessage}`);
  }
}

/**
 * 指定されたスラッグのMDXコンテンツを取得してシリアライズ
 */
export async function getSerializedContent(
  slug: string,
  locale?: string,
): Promise<SerializedContent | null> {
  const filePath = `${slug}.mdx`;
  const content = await getMDXContent(filePath, locale);

  if (!content) {
    return null;
  }

  const mdxSource = await serializeMDX(content.content);

  return {
    mdxSource,
    frontMatter: content.frontMatter,
  };
}

/**
 * MDXコンテンツを直接返す（next-mdx-remote/rsc用）
 */
export async function getMDXContentForRSC(
  slug: string,
  locale?: string,
): Promise<{ content: string; frontMatter: FrontMatter } | null> {
  // Try direct file first (e.g. "faq/features" → "faq/features.mdx")
  const filePath = `${slug}.mdx`;
  const content = await getMDXContent(filePath, locale);

  if (content) {
    return {
      content: content.content,
      frontMatter: content.frontMatter,
    };
  }

  // Fallback to index file (e.g. "faq" → "faq/index.mdx")
  const indexPath = `${slug}/index.mdx`;
  const indexContent = await getMDXContent(indexPath, locale);

  if (indexContent) {
    return {
      content: indexContent.content,
      frontMatter: indexContent.frontMatter,
    };
  }

  return null;
}

/**
 * すべてのMDXファイルを取得（cache()で同一リクエスト内の重複呼び出しを排除）
 * locale が指定された場合、content/docs/{locale}/ ディレクトリをスキャン
 */
export const getAllContent = cache(async function getAllContentImpl(
  locale?: string,
): Promise<ContentData[]> {
  const allContent: ContentData[] = [];
  const errors: { path: string; error: unknown }[] = [];
  const basePath = getLocalizedContentPath(locale);

  async function scanDirectory(dir: string): Promise<void> {
    const fullPath = path.join(basePath, dir);

    try {
      if (!fs.existsSync(fullPath)) {
        if (dir === '') {
          console.warn(`[MDX] Content directory not found: ${fullPath}`);
        }
        return;
      }

      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(fullPath, { withFileTypes: true });
      } catch (readError) {
        console.error(
          `[MDX] Failed to read directory: ${fullPath}`,
          readError instanceof Error ? readError.message : readError,
        );
        return;
      }

      for (const item of items) {
        const itemPath = path.join(dir, item.name);

        try {
          if (item.isDirectory()) {
            // ロケール指定なしの場合、ロケールディレクトリをスキップ
            if (!locale && LOCALE_DIRS.includes(item.name)) {
              continue;
            }
            await scanDirectory(itemPath);
          } else if (item.name.endsWith('.mdx')) {
            const content = await getMDXContent(itemPath, locale);
            if (content && !content.frontMatter.draft) {
              allContent.push(content);
            }
          }
        } catch (itemError) {
          errors.push({ path: itemPath, error: itemError });
        }
      }
    } catch (error) {
      errors.push({ path: dir, error });
    }
  }

  try {
    await scanDirectory('');

    // Log any errors that occurred during scanning
    if (errors.length > 0) {
      console.error(`[MDX] Failed to process ${errors.length} item(s):`);
      errors.forEach(({ path: errorPath, error }) => {
        console.error(`  - ${errorPath}:`, error instanceof Error ? error.message : error);
      });
    }

    // orderでソート
    return allContent.sort((a, b) => {
      if (a.frontMatter.category !== b.frontMatter.category) {
        return a.frontMatter.category.localeCompare(b.frontMatter.category);
      }
      return (a.frontMatter.order || 0) - (b.frontMatter.order || 0);
    });
  } catch (error) {
    console.error('[MDX] Unexpected error in getAllContent:', error);
    return [];
  }
});

/**
 * カテゴリー別にコンテンツを取得
 */
export async function getContentByCategory(locale?: string): Promise<ContentCollection> {
  const allContent = await getAllContent(locale);
  const collection: ContentCollection = {};

  for (const content of allContent) {
    const category = content.frontMatter.category;
    if (!collection[category]) {
      collection[category] = [];
    }
    collection[category].push(content);
  }

  return collection;
}

/**
 * 指定されたカテゴリーのコンテンツを取得
 */
export async function getContentBySlug(
  category: ContentCategory,
  slug: string,
  locale?: string,
): Promise<SerializedContent | null> {
  const filePath = `${category}/${slug}.mdx`;
  return await getSerializedContent(filePath, locale);
}

/**
 * 関連性スコアを計算
 * - 共通タグ: 各タグにつき +2点
 * - 同じカテゴリ: +1点
 * - relatedDocsで指定されている: +5点
 */
function calculateRelevanceScore(current: ContentData, candidate: ContentData): number {
  let score = 0;
  const currentTags = current.frontMatter.tags || [];
  const candidateTags = candidate.frontMatter.tags || [];

  // 共通タグのスコア
  const commonTags = currentTags.filter((tag) => candidateTags.includes(tag));
  score += commonTags.length * 2;

  // 同じカテゴリのスコア
  if (current.frontMatter.category === candidate.frontMatter.category) {
    score += 1;
  }

  // relatedDocsで明示的に指定されている場合
  const relatedDocs = current.frontMatter.ai?.relatedDocs || [];
  if (relatedDocs.some((doc) => doc.includes(candidate.slug))) {
    score += 5;
  }

  return score;
}

/**
 * 関連コンテンツを取得（スコアリングで関連性の高い順に取得）
 */
export async function getRelatedContent(
  _category: string, // 後方互換性のため引数は残す
  currentSlug: string,
  limit: number = 3,
  locale?: string,
): Promise<ContentData[]> {
  const allContent = await getAllContent(locale);

  // 現在の記事を取得
  const currentContent = allContent.find((content) => content.slug === currentSlug);
  if (!currentContent) {
    return [];
  }

  // 自分自身を除外してスコアリング
  const scoredContent = allContent
    .filter((content) => content.slug !== currentSlug)
    .map((content) => ({
      content,
      score: calculateRelevanceScore(currentContent, content),
    }))
    .filter(({ score }) => score > 0) // スコア0は除外
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scoredContent.map(({ content }) => content);
}

/**
 * 検索機能（タイトル、説明、タグで検索）
 */
export async function searchContent(query: string, locale?: string): Promise<ContentData[]> {
  const allContent = await getAllContent(locale);
  const lowercaseQuery = query.toLowerCase();

  return allContent.filter((content) => {
    const { title, description, tags } = content.frontMatter;

    return (
      title.toLowerCase().includes(lowercaseQuery) ||
      description.toLowerCase().includes(lowercaseQuery) ||
      tags?.some((tag) => tag.toLowerCase().includes(lowercaseQuery)) ||
      content.content.toLowerCase().includes(lowercaseQuery)
    );
  });
}

/**
 * パンくずリスト用のパス情報を生成
 */
export function generateBreadcrumbs(
  slug: string,
): Array<{ title: string; href: string; clickable?: boolean }> {
  const breadcrumbs = [];

  // Getting Startedセクションのページの場合
  const gettingStartedPages = [
    'introduction',
    'installation',
    'quickstart',
    'configuration',
    'first-steps',
  ];
  if (gettingStartedPages.includes(slug)) {
    breadcrumbs.push({
      title: 'Getting Started',
      href: '/docs',
      clickable: false,
    });

    const pageTitle = slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    breadcrumbs.push({
      title: pageTitle,
      href: `/docs/${slug}`,
      clickable: true,
    });

    return breadcrumbs;
  }

  // その他のページの場合（カテゴリー部分もクリック不可）
  const parts = slug.split('/');

  let currentPath = '/docs';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    currentPath += `/${part}`;
    const title = part
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // 最初の部分（カテゴリー）はクリック不可、最後の部分もクリック不可
    const clickable = i !== 0 && i !== parts.length - 1;

    breadcrumbs.push({
      title,
      href: currentPath,
      clickable,
    });
  }

  return breadcrumbs;
}
