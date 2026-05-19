import {
  type BlogFrontMatter,
  blogFrontMatterSchema,
  parseFrontMatter,
} from '@/lib/content-schemas';
import { createStructuredError, ErrorCategory, ErrorLevel, logError } from '@/lib/error-utils';
import { calculateReadingTime } from '@/lib/utils';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import { cache } from 'react';

export type BlogPostFrontMatter = BlogFrontMatter;

export interface BlogPost {
  slug: string;
  frontMatter: BlogPostFrontMatter;
  content: string;
  excerpt: string;
  readingTime: number;
}

export interface BlogPostMeta {
  slug: string;
  frontMatter: BlogPostFrontMatter;
  excerpt: string;
  readingTime: number;
}

const BLOG_BASE_DIR = path.join(process.cwd(), 'content', 'blog');

/**
 * ロケールを考慮したブログディレクトリパスを取得
 */
function getBlogDir(locale?: string): string {
  if (locale) {
    return path.join(BLOG_BASE_DIR, locale);
  }
  return BLOG_BASE_DIR;
}

// Generate article excerpt
export function generateExcerpt(content: string, maxLength: number = 160): string {
  // Remove Markdown syntax and HTML tags
  // 順序が重要: コードブロック→インラインコード、画像→リンクの順で処理
  const cleanContent = content
    .replace(/```[\s\S]*?```/g, '') // Code blocks（インラインコードより先に処理）
    .replace(/#{1,6}\s+/g, '') // Headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
    .replace(/\*(.+?)\*/g, '$1') // Italic
    .replace(/`(.+?)`/g, '$1') // Inline code
    .replace(/!\[.*?\]\(.+?\)/g, '') // Images（リンクより先に処理）
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links
    .replace(/\n+/g, ' ') // Line breaks
    .trim();

  if (cleanContent.length <= maxLength) {
    return cleanContent;
  }

  return cleanContent.slice(0, maxLength).trim() + '...';
}

// Get all blog post metadata（cache()で同一リクエスト内の重複呼び出しを排除）
export const getAllBlogPostMetas = cache(async function getAllBlogPostMetasImpl(
  locale?: string,
): Promise<BlogPostMeta[]> {
  const blogDir = getBlogDir(locale);

  try {
    if (!fs.existsSync(blogDir)) {
      console.warn(`[Blog] Blog directory not found: ${blogDir}`);
      return [];
    }

    let files: string[];
    try {
      files = fs.readdirSync(blogDir);
    } catch (error) {
      logError(
        createStructuredError(
          `Failed to read blog directory: ${blogDir}`,
          ErrorCategory.FILESYSTEM,
          ErrorLevel.ERROR,
          'getAllBlogPostMetas',
          error,
        ),
      );
      return [];
    }

    const mdxFiles = files.filter((file) => file.endsWith('.mdx'));
    const posts: BlogPostMeta[] = [];
    const errors: { file: string; error: unknown }[] = [];

    await Promise.all(
      mdxFiles.map(async (file) => {
        const filePath = path.join(blogDir, file);
        try {
          const slug = file.replace('.mdx', '');
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const { data, content } = matter(fileContent);

          const frontMatter = parseFrontMatter(blogFrontMatterSchema, data, filePath);

          // Validate required frontmatter fields
          if (!frontMatter.title) {
            console.warn(`[Blog] Missing required 'title' in frontmatter: ${filePath}`);
          }
          if (!frontMatter.publishedAt) {
            console.warn(`[Blog] Missing required 'publishedAt' in frontmatter: ${filePath}`);
          }

          const readingTime = calculateReadingTime(content);
          const excerpt = frontMatter.description || generateExcerpt(content);

          posts.push({
            slug,
            frontMatter: {
              ...frontMatter,
              readingTime,
            },
            excerpt,
            readingTime,
          });
        } catch (error) {
          errors.push({ file: filePath, error });
        }
      }),
    );

    // Log any errors that occurred during processing
    if (errors.length > 0) {
      logError(
        createStructuredError(
          `Failed to process ${errors.length} blog post(s)`,
          ErrorCategory.FILESYSTEM,
          ErrorLevel.WARN,
          'getAllBlogPostMetas',
        ),
      );
      errors.forEach(({ file, error }) => {
        logError(
          createStructuredError(
            `Failed to process ${path.basename(file)}`,
            ErrorCategory.FILESYSTEM,
            ErrorLevel.ERROR,
            'getAllBlogPostMetas',
            error,
          ),
        );
      });
    }

    // Exclude drafts and sort by publish date (descending)
    return posts
      .filter((post) => !post.frontMatter.draft)
      .sort((a, b) => {
        const dateA = a.frontMatter.publishedAt ? new Date(a.frontMatter.publishedAt).getTime() : 0;
        const dateB = b.frontMatter.publishedAt ? new Date(b.frontMatter.publishedAt).getTime() : 0;
        return dateB - dateA;
      });
  } catch (error) {
    logError(
      createStructuredError(
        'Unexpected error in getAllBlogPostMetas',
        ErrorCategory.INTERNAL,
        ErrorLevel.ERROR,
        'getAllBlogPostMetas',
        error,
      ),
    );
    return [];
  }
});

// Get individual article
export async function getBlogPost(slug: string, locale?: string): Promise<BlogPost | null> {
  // Validate slug to prevent path traversal
  if (!slug || slug.includes('..') || slug.includes('/')) {
    console.warn(`[Blog] Invalid slug provided: ${slug}`);
    return null;
  }

  const blogDir = getBlogDir(locale);
  const filePath = path.join(blogDir, `${slug}.mdx`);

  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    const frontMatter = parseFrontMatter(blogFrontMatterSchema, data, filePath);

    // Return null for drafts
    if (frontMatter.draft) {
      return null;
    }

    const readingTime = calculateReadingTime(content);
    const excerpt = frontMatter.description || generateExcerpt(content);

    return {
      slug,
      frontMatter: {
        ...frontMatter,
        readingTime,
      },
      content,
      excerpt,
      readingTime,
    };
  } catch (error) {
    console.error(
      `[Blog] Failed to read blog post: ${filePath}`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

// Get articles by tag
export async function getBlogPostsByTag(tag: string, locale?: string): Promise<BlogPostMeta[]> {
  const allPosts = await getAllBlogPostMetas(locale);
  return allPosts.filter((post) =>
    post.frontMatter.tags.some((postTag) => postTag.toLowerCase() === tag.toLowerCase()),
  );
}

// Get articles by category
export async function getBlogPostsByCategory(
  category: string,
  locale?: string,
): Promise<BlogPostMeta[]> {
  const allPosts = await getAllBlogPostMetas(locale);
  return allPosts.filter(
    (post) => post.frontMatter.category.toLowerCase() === category.toLowerCase(),
  );
}

// Get related articles
export async function getRelatedPosts(
  currentSlug: string,
  maxPosts: number = 3,
  locale?: string,
): Promise<BlogPostMeta[]> {
  const allPosts = await getAllBlogPostMetas(locale);
  const currentPost = allPosts.find((post) => post.slug === currentSlug);

  if (!currentPost) {
    return [];
  }

  const currentTags = currentPost.frontMatter.tags;
  const currentCategory = currentPost.frontMatter.category;

  // Sort other articles by relevance
  const relatedPosts = allPosts
    .filter((post) => post.slug !== currentSlug)
    .map((post) => {
      let score = 0;

      // Higher score for same category
      if (post.frontMatter.category === currentCategory) {
        score += 10;
      }

      // Add score based on common tags
      const commonTags = post.frontMatter.tags.filter((tag) => currentTags.includes(tag)).length;
      score += commonTags * 5;

      return { ...post, score };
    })
    .filter((post) => post.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPosts);

  return relatedPosts.map(({ score: _score, ...post }) => post);
}

// Get all tags
export async function getAllTags(locale?: string): Promise<{ tag: string; count: number }[]> {
  const allPosts = await getAllBlogPostMetas(locale);
  const tagCounts: Record<string, number> = {};

  allPosts.forEach((post) => {
    post.frontMatter.tags.forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// Get all tags as simple string array
export async function getAllTagNames(locale?: string): Promise<string[]> {
  const tagsWithCounts = await getAllTags(locale);
  return tagsWithCounts.map(({ tag }) => tag);
}

// Get all categories
export async function getAllCategories(
  locale?: string,
): Promise<{ category: string; count: number }[]> {
  const allPosts = await getAllBlogPostMetas(locale);
  const categoryCounts: Record<string, number> = {};

  allPosts.forEach((post) => {
    const category = post.frontMatter.category;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  return Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

// Search articles
export async function searchBlogPosts(query: string, locale?: string): Promise<BlogPostMeta[]>;
export async function searchBlogPosts(
  posts: BlogPostMeta[],
  query: string,
): Promise<BlogPostMeta[]>;
export async function searchBlogPosts(
  queryOrPosts: string | BlogPostMeta[],
  queryOrLocale?: string,
): Promise<BlogPostMeta[]> {
  let allPosts: BlogPostMeta[];
  let searchTerm: string;

  if (typeof queryOrPosts === 'string') {
    allPosts = await getAllBlogPostMetas(queryOrLocale);
    searchTerm = queryOrPosts.toLowerCase();
  } else {
    allPosts = queryOrPosts;
    searchTerm = (queryOrLocale || '').toLowerCase();
  }

  if (!searchTerm) {
    return allPosts;
  }

  return allPosts.filter((post) => {
    const titleMatch = post.frontMatter.title.toLowerCase().includes(searchTerm);
    const descriptionMatch = post.frontMatter.description?.toLowerCase().includes(searchTerm);
    const tagMatch = post.frontMatter.tags.some((tag) => tag.toLowerCase().includes(searchTerm));
    const categoryMatch = post.frontMatter.category.toLowerCase().includes(searchTerm);
    const excerptMatch = post.excerpt.toLowerCase().includes(searchTerm);

    return titleMatch || descriptionMatch || tagMatch || categoryMatch || excerptMatch;
  });
}

// Get featured articles
export async function getFeaturedPosts(locale?: string): Promise<BlogPostMeta[]> {
  const allPosts = await getAllBlogPostMetas(locale);
  return allPosts.filter((post) => post.frontMatter.featured);
}

// Get latest articles
export async function getRecentPosts(limit: number = 5, locale?: string): Promise<BlogPostMeta[]> {
  const allPosts = await getAllBlogPostMetas(locale);
  return allPosts.slice(0, limit);
}
