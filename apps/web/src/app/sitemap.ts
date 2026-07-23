import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@dayopt/config';

import { getAllBlogPostMetas } from '@web/features/blog';
import { getAllContent } from '@web/lib/mdx';
import { siteConfig } from '@web/platform/seo/metadata';
import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;
  // サポートする言語（@dayopt/config が source of truth）
  const locales = SUPPORTED_LOCALES;

  // canonical（generateSEOMetadata / localePrefix: 'as-needed'）と同じ規則で URL を作る。
  // default locale は prefix なし。sitemap と canonical の不一致は検索エンジンに矛盾シグナルを送るため揃える
  const localizedUrl = (locale: string, path: string) =>
    locale === DEFAULT_LOCALE ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  // Helper function to create pages for both locales
  const createLocalizedPages = (
    path: string,
    options: {
      lastModified: Date;
      changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
      priority: number;
    },
  ) => {
    return locales.map((locale) => ({
      url: localizedUrl(locale, path),
      lastModified: options.lastModified,
      changeFrequency: options.changeFrequency,
      priority: options.priority,
    }));
  };

  // Static pages for both locales
  const staticPages = [
    // Home pages
    ...createLocalizedPages('', {
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    }),
    // Contact pages
    ...createLocalizedPages('/contact', {
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    }),
    // Refund policy pages
    ...createLocalizedPages('/legal/refund', {
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    }),
    // Blog listing pages
    ...createLocalizedPages('/blog', {
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    }),
    // Docs pages
    ...createLocalizedPages('/docs', {
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    }),
    // Search pages
    ...createLocalizedPages('/search', {
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    }),
  ];

  // Track which content types were successfully loaded
  const contentStatus = {
    blog: false,
    docs: false,
  };

  let blogPages: MetadataRoute.Sitemap = [];
  let docPages: MetadataRoute.Sitemap = [];

  // Blog posts for both locales
  try {
    for (const locale of locales) {
      const blogPosts = await getAllBlogPostMetas(locale);
      blogPages.push(
        ...blogPosts.map((post) => ({
          url: localizedUrl(locale, `/blog/${post.slug}`),
          lastModified: new Date(
            post.frontMatter.updatedAt || post.frontMatter.publishedAt || new Date(),
          ),
          changeFrequency: 'monthly' as const,
          priority: post.frontMatter.featured ? 0.8 : 0.6,
        })),
      );
    }
    contentStatus.blog = true;
  } catch (error) {
    console.error(
      '[Sitemap] Failed to load blog posts:',
      error instanceof Error ? error.message : error,
    );
  }

  // Documentation pages for both locales (dynamically from MDX files)
  try {
    for (const locale of locales) {
      const allDocs = await getAllContent(locale);
      docPages.push(
        ...allDocs.map((doc) => ({
          url: localizedUrl(locale, `/docs/${doc.slug}`),
          lastModified: doc.frontMatter.updatedAt
            ? new Date(doc.frontMatter.updatedAt)
            : new Date(),
          changeFrequency: 'weekly' as const,
          priority: doc.frontMatter.featured ? 0.8 : 0.6,
        })),
      );
    }
    contentStatus.docs = true;
  } catch (error) {
    console.error('[Sitemap] Failed to load docs:', error instanceof Error ? error.message : error);
  }

  // Log overall status
  const failedSources = Object.entries(contentStatus)
    .filter(([, success]) => !success)
    .map(([source]) => source);

  if (failedSources.length > 0) {
    console.warn(`[Sitemap] Some content sources failed: ${failedSources.join(', ')}`);
  }

  return [...staticPages, ...blogPages, ...docPages];
}
