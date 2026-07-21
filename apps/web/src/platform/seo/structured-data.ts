import { createDayoptUrl, dayoptBrand, dayoptContact } from '@dayopt/config';

import { siteConfig } from './site-config';

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
        sameAs: [dayoptBrand.xUrl, dayoptBrand.githubUrl],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'Customer Service',
          email: dayoptContact.supportEmail,
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
            urlTemplate: createDayoptUrl(baseUrl, '/search?q={search_term_string}'),
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

export function generateBreadcrumbs(items: Array<{ name: string; url: string }>) {
  return [{ name: 'ホーム', url: '/' }, ...items];
}
