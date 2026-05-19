import { env, getSiteUrl } from '@/platform/config/env';
import { Metadata } from 'next';

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  section?: string;
  tags?: string[];
  locale?: string;
  alternateLocales?: string[];
  noindex?: boolean;
  hreflang?: Record<string, string>;
}

export interface SiteConfig {
  name: string;
  title: string;
  description: string;
  url: string;
  ogImage: string;
  creator: string;
  twitterHandle: string;
  keywords: string[];
  locale: string;
  alternateLocales: string[];
}

export const siteConfig: SiteConfig = {
  name: 'Dayopt',
  title: 'Dayopt - スケーラブルなアプリケーションのためのモダンSaaSプラットフォーム',
  description:
    'Dayoptで次世代のSaaSアプリケーションを構築、デプロイ、スケール。認証、ユーザー管理、請求処理など包括的なツールを提供します。',
  url: getSiteUrl(),
  ogImage: '/og-image.png',
  creator: 'Dayopt Team',
  twitterHandle: '@dayoptapp',
  keywords: [
    'SaaS',
    'Software as a Service',
    'API',
    'Authentication',
    'User Management',
    'Billing',
    'React',
    'Next.js',
    'TypeScript',
    'Modern Development',
  ],
  locale: 'ja',
  alternateLocales: ['en', 'ja'],
};

/**
 * URLからロケールプレフィックスを除去
 * 例: '/en/about' → '/about', '/ja/blog' → '/blog', '/about' → '/about'
 */
function stripLocaleFromUrl(url: string): string {
  return url.replace(/^\/(en|ja)(\/|$)/, '/');
}

/**
 * パスを正規化（先頭スラッシュ確保、末尾スラッシュ除去）
 */
function normalizePath(path: string): string {
  // 空やルートの場合
  if (!path || path === '/') return '';
  // 先頭スラッシュを確保
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  // 末尾スラッシュを除去（ルート以外）
  return withLeadingSlash.replace(/\/$/, '');
}

/**
 * Convert locale code to proper format
 */
function formatLocaleForOpenGraph(locale: string): string {
  switch (locale) {
    case 'ja':
      return 'ja_JP';
    case 'en':
      return 'en_US';
    default:
      return locale.includes('_') ? locale : `${locale}_${locale.toUpperCase()}`;
  }
}

/**
 * Generate comprehensive metadata for pages
 */
export function generateSEOMetadata(data: SEOData = {}): Metadata {
  const {
    title,
    description = siteConfig.description,
    keywords = [],
    image,
    url,
    type = 'website',
    publishedTime,
    modifiedTime,
    authors,
    section,
    tags = [],
    locale = siteConfig.locale,
    noindex = false,
  } = data;

  const pageTitle = title ? `${title} | ${siteConfig.name}` : siteConfig.title;

  // URLからロケールプレフィックスを除去して正規化
  const normalizedPath = normalizePath(stripLocaleFromUrl(url || ''));

  // canonicalはロケール付きの完全URL
  // localePrefix: 'as-needed' なので、enはプレフィックスなし、jaはプレフィックスあり
  const canonicalUrl =
    locale === 'en'
      ? `${siteConfig.url}${normalizedPath}`
      : `${siteConfig.url}/${locale}${normalizedPath}`;

  const pageImage = image
    ? `${siteConfig.url}${image}`
    : `${siteConfig.url}/api/og?title=${encodeURIComponent(title || siteConfig.title)}`;

  const allKeywords = [...siteConfig.keywords, ...keywords, ...tags].filter(Boolean);

  return {
    title: pageTitle,
    description,
    keywords: allKeywords.join(', '),
    authors: authors?.map((name) => ({ name })) || [{ name: siteConfig.creator }],
    creator: siteConfig.creator,
    publisher: siteConfig.name,
    robots: {
      index: !noindex,
      follow: !noindex,
      googleBot: {
        index: !noindex,
        follow: !noindex,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        // localePrefix: 'as-needed' に従い、enはプレフィックスなし
        'en-US': `${siteConfig.url}${normalizedPath}`,
        'ja-JP': `${siteConfig.url}/ja${normalizedPath}`,
        'x-default': `${siteConfig.url}${normalizedPath}`,
      },
    },
    openGraph: {
      type: type as 'website' | 'article',
      locale: formatLocaleForOpenGraph(locale),
      url: canonicalUrl,
      title: pageTitle,
      description,
      siteName: siteConfig.name,
      images: [
        {
          url: pageImage,
          width: 1200,
          height: 630,
          alt: title || siteConfig.title,
        },
      ],
      ...(type === 'article' && {
        publishedTime,
        modifiedTime,
        authors: authors || [siteConfig.creator],
        section,
        tags,
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
      images: [pageImage],
      creator: siteConfig.twitterHandle,
      site: siteConfig.twitterHandle,
    },
    verification: {
      google: env.GOOGLE_SITE_VERIFICATION,
      yandex: env.YANDEX_VERIFICATION,
      yahoo: env.YAHOO_VERIFICATION,
    },
  };
}

/**
 * Generate metadata for article pages (blog, releases, docs)
 */
export function generateArticleMetadata(data: {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  updatedAt?: string;
  authors?: string[];
  tags?: string[];
  category?: string;
  type: 'blog' | 'docs' | 'release';
}): Metadata {
  const { type, slug, publishedAt, updatedAt, authors, tags, category } = data;

  const urlPath = `/${type}/${slug}`;
  const section = category || type;

  return generateSEOMetadata({
    ...data,
    url: urlPath,
    type: 'article',
    publishedTime: publishedAt,
    modifiedTime: updatedAt || publishedAt,
    authors,
    section,
    tags,
    keywords: tags,
  });
}

type StructuredDataValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StructuredDataValue[]
  | { [key: string]: StructuredDataValue };
type StructuredDataInput = {
  title?: string;
  description?: string;
  image?: string;
  publishedAt?: string;
  updatedAt?: string;
  author?: string;
  url?: string;
  tags?: string[];
  category?: string;
  articleType?: string;
  dependencies?: string[];
  items?: Array<{ name: string; url: string }>;
  [key: string]: StructuredDataValue;
};

/**
 * Generate structured data (JSON-LD)
 */
export function generateStructuredData(type: string, data: StructuredDataInput) {
  const baseUrl = siteConfig.url;

  switch (type) {
    case 'organization':
      return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: siteConfig.name,
        url: baseUrl,
        logo: `${baseUrl}/logo.png`,
        description: siteConfig.description,
        sameAs: ['https://x.com/dayoptapp', 'https://github.com/dayoptapp'],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'Customer Service',
          email: 'support@dayopt.app',
        },
      };

    case 'website':
      return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteConfig.name,
        description: siteConfig.description,
        url: baseUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${baseUrl}/search?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      };

    case 'article':
      return {
        '@context': 'https://schema.org',
        '@type': data.articleType || 'Article',
        headline: data.title,
        description: data.description,
        image: data.image
          ? `${baseUrl}${data.image}`
          : `${baseUrl}/api/og?title=${encodeURIComponent(data.title ?? '')}`,
        datePublished: data.publishedAt,
        dateModified: data.updatedAt || data.publishedAt,
        author: {
          '@type': 'Person',
          name: data.author || siteConfig.creator,
        },
        publisher: {
          '@type': 'Organization',
          name: siteConfig.name,
          logo: {
            '@type': 'ImageObject',
            url: `${baseUrl}/logo.png`,
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${baseUrl}${data.url}`,
        },
        keywords: Array.isArray(data.tags) ? data.tags.join(', ') : undefined,
        articleSection: data.category,
      };

    case 'techArticle':
      return {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: data.title,
        description: data.description,
        image: data.image
          ? `${baseUrl}${data.image}`
          : `${baseUrl}/api/og?title=${encodeURIComponent(data.title ?? '')}`,
        datePublished: data.publishedAt,
        dateModified: data.updatedAt || data.publishedAt,
        author: {
          '@type': 'Organization',
          name: siteConfig.name,
        },
        publisher: {
          '@type': 'Organization',
          name: siteConfig.name,
          logo: {
            '@type': 'ImageObject',
            url: `${baseUrl}/logo.png`,
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${baseUrl}${data.url}`,
        },
        proficiencyLevel: 'Beginner',
        dependencies: data.dependencies || [],
        applicationCategory: 'DeveloperApplication',
      };

    case 'SoftwareApplication':
      return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: data.name || siteConfig.name,
        description: data.description || siteConfig.description,
        url: siteConfig.url,
        applicationCategory: data.applicationCategory,
        operatingSystem: data.operatingSystem,
        offers: data.offers,
        author: {
          '@type': 'Organization',
          name: siteConfig.name,
        },
      };

    case 'breadcrumb':
      return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: (data.items as Array<{ name: string; url: string }>).map(
          (item, index: number) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: `${baseUrl}${item.url}`,
          }),
        ),
      };

    default:
      return null;
  }
}

// Note: StructuredData component moved to /components/seo/StructuredData.tsx

/**
 * Generate breadcrumb data
 */
export function generateBreadcrumbs(items: Array<{ name: string; url: string }>) {
  return [{ name: 'ホーム', url: '/' }, ...items];
}
