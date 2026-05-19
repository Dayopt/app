import { getAllBlogPostMetas } from '@/features/blog';
import { getAllReleaseMetas } from '@/features/releases';
import { getAllTags } from '@/features/tags';
import { getAllContent } from '@/lib/mdx';
import { siteConfig } from '@/platform/seo/metadata';
import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;
  const locales = ['en', 'ja'];

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
      url: `${baseUrl}/${locale}${path}`,
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
    // Releases pages
    ...createLocalizedPages('/releases', {
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
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
    releases: false,
    docs: false,
    tags: false,
  };

  let blogPages: MetadataRoute.Sitemap = [];
  let releasePages: MetadataRoute.Sitemap = [];
  let docPages: MetadataRoute.Sitemap = [];
  let tagPages: MetadataRoute.Sitemap = [];

  // Blog posts for both locales
  try {
    for (const locale of locales) {
      const blogPosts = await getAllBlogPostMetas(locale);
      blogPages.push(
        ...blogPosts.map((post) => ({
          url: `${baseUrl}/${locale}/blog/${post.slug}`,
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

  // Release notes for both locales
  try {
    for (const locale of locales) {
      const releases = await getAllReleaseMetas(locale);
      releasePages.push(
        ...releases.map((release) => ({
          url: `${baseUrl}/${locale}/releases/${release.frontMatter.version}`,
          lastModified: new Date(release.frontMatter.date || new Date()),
          changeFrequency: 'yearly' as const,
          priority: 0.7,
        })),
      );
    }
    contentStatus.releases = true;
  } catch (error) {
    console.error(
      '[Sitemap] Failed to load releases:',
      error instanceof Error ? error.message : error,
    );
  }

  // Documentation pages for both locales (dynamically from MDX files)
  try {
    for (const locale of locales) {
      const allDocs = await getAllContent(locale);
      docPages.push(
        ...allDocs.map((doc) => ({
          url: `${baseUrl}/${locale}/docs/${doc.slug}`,
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

  // Tag pages for both locales
  try {
    const tags = await getAllTags();
    tagPages = tags.slice(0, 50).flatMap((tag) =>
      locales.map((locale) => ({
        url: `${baseUrl}/${locale}/tags/${encodeURIComponent(tag.tag.toLowerCase())}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
    );
    contentStatus.tags = true;
  } catch (error) {
    console.error('[Sitemap] Failed to load tags:', error instanceof Error ? error.message : error);
  }

  // Log overall status
  const failedSources = Object.entries(contentStatus)
    .filter(([, success]) => !success)
    .map(([source]) => source);

  if (failedSources.length > 0) {
    console.warn(`[Sitemap] Some content sources failed: ${failedSources.join(', ')}`);
  }

  return [...staticPages, ...blogPages, ...releasePages, ...docPages, ...tagPages];
}
