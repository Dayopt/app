import { SUPPORTED_LOCALES } from '@dayopt/config';
import type { MetadataRoute } from 'next';

import { getAppUrl } from '@/lib/app-url';

// サポートする言語（@dayopt/config が source of truth）
const locales = SUPPORTED_LOCALES;

/**
 * 動的Sitemap生成（多言語対応）
 *
 * app側は認証必須のSaaSページのみのため、公開ページは最小限。
 * マーケティングページ（LP, blog, docs, legal等）はweb側のsitemapで管理。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppUrl();
  const now = new Date();

  // 多言語URLを生成するヘルパー関数
  const createLocalizedUrls = (
    path: string,
    changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never',
    priority: number,
  ): MetadataRoute.Sitemap => {
    return locales.map((locale) => ({
      url: `${baseUrl}/${locale}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, `${baseUrl}/${l}${path}`])),
      },
    }));
  };

  // 公開ページのみ（認証不要でアクセスできるページ）
  const publicPages: MetadataRoute.Sitemap = [
    // ホームページ（web側にリダイレクトされるが、フォールバックとして残す）
    ...createLocalizedUrls('', 'daily', 1.0),
  ];

  return publicPages;
}
