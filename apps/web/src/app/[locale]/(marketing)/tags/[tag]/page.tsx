import { Container } from '@/components/ui/container';
import { TagDetailClient, getAllTags, getContentByTag } from '@/features/tags';
import { routing } from '@/platform/i18n/routing';
import { generateSEOMetadata } from '@/platform/seo/metadata';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface TagPageProps {
  params: Promise<{ tag: string; locale: string }>;
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { tag, locale } = await params;
  const decodedTag = decodeURIComponent(tag);
  const [tagData, t] = await Promise.all([
    getContentByTag(decodedTag),
    getTranslations({ locale, namespace: 'tags' }),
  ]);

  if (tagData.totalCount === 0) {
    return {
      title: locale === 'ja' ? 'タグが見つかりません' : 'Tag not found',
      description:
        locale === 'ja'
          ? 'お探しのタグは見つかりませんでした。'
          : 'The tag you are looking for could not be found.',
    };
  }

  const description =
    locale === 'ja'
      ? `「${tagData.tag}」タグのコンテンツ一覧。ブログ記事 ${tagData.blog.length}件、リリース ${tagData.releases.length}件、ドキュメント ${tagData.docs.length}件。`
      : `Browse all content tagged with "${tagData.tag}". ${tagData.blog.length} blog posts, ${tagData.releases.length} releases, ${tagData.docs.length} docs.`;

  return generateSEOMetadata({
    title: `#${tagData.tag} - ${t('title')}`,
    description,
    url: `/${locale}/tags/${encodeURIComponent(tagData.tag)}`,
    locale,
    type: 'website',
  });
}

// ISR: タグ詳細は1時間ごとに再検証
export const revalidate = 3600;

export async function generateStaticParams() {
  const allTags = await getAllTags();

  const params = [];
  for (const locale of routing.locales) {
    for (const tagItem of allTags) {
      params.push({ locale, tag: encodeURIComponent(tagItem.tag) });
    }
  }

  return params;
}

export default async function TagDetailPage({ params }: TagPageProps) {
  const { tag, locale } = await params;
  setRequestLocale(locale);

  const decodedTag = decodeURIComponent(tag);
  const [tagData, allTags] = await Promise.all([getContentByTag(decodedTag), getAllTags()]);

  if (tagData.totalCount === 0) {
    notFound();
  }

  const popularTags = allTags.slice(0, 10);

  return (
    <div className="bg-background min-h-screen">
      <section className="py-16">
        <Container>
          <div className="mx-auto max-w-6xl">
            <TagDetailClient
              tag={tagData.tag}
              blogContent={tagData.blog}
              releaseContent={tagData.releases}
              docsContent={tagData.docs}
              popularTags={popularTags}
              locale={locale}
            />
          </div>
        </Container>
      </section>
    </div>
  );
}
