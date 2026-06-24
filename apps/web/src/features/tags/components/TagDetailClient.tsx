'use client';

import { ContentHeader } from '@/components/content/ContentHeader';
import { TagPill } from '@/components/ui/display/tag-pill';
import { EmptyState } from '@/components/ui/feedback/empty-state';
import { SearchInput } from '@/components/ui/inputs/search-input';
import { Link } from '@/platform/i18n/navigation';
import { Heading } from '@dayopt/components';
import { BookOpen, FileText, Filter, Megaphone, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TaggedContent } from '../lib/tags-server';

// 統一コンテンツアイテム（TaggedContentにhrefを追加）
interface UnifiedContentItem extends TaggedContent {
  href: string;
}

interface TagDetailClientProps {
  tag: string;
  blogContent: TaggedContent[];
  releaseContent: TaggedContent[];
  docsContent: TaggedContent[];
  popularTags: { tag: string; count: number }[];
  locale: string;
}

export function TagDetailClient({
  tag,
  blogContent,
  releaseContent,
  docsContent,
  popularTags,
  locale,
}: TagDetailClientProps) {
  const t = useTranslations('tags');
  const tDetail = useTranslations('tags.detail');
  const [searchQuery, setSearchQuery] = useState('');

  const totalCount = blogContent.length + releaseContent.length + docsContent.length;

  // フィルタリング
  const filterContent = <T extends TaggedContent>(items: T[]) => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query),
    );
  };

  const filteredBlog = filterContent(blogContent);
  const filteredReleases = filterContent(releaseContent);
  const filteredDocs = filterContent(docsContent);

  // 統一コンテンツリストを作成（blog + releases + docs を統合）
  const unifiedContent: UnifiedContentItem[] = [];

  filteredBlog.forEach((item) => {
    unifiedContent.push({ ...item, href: `/blog/${item.slug}` });
  });
  filteredReleases.forEach((item) => {
    unifiedContent.push({ ...item, href: `/releases/${item.slug}` });
  });
  filteredDocs.forEach((item) => {
    unifiedContent.push({ ...item, href: `/docs/${item.slug}` });
  });

  // 日付でソート（新しい順）
  unifiedContent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const hasContent = unifiedContent.length > 0;
  const localeCode = locale === 'ja' ? 'ja-JP' : 'en-US';

  return (
    <div>
      <ContentHeader title={`#${tag}`} />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
        {/* 左サイドバー */}
        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <div className="border-border bg-background hidden rounded-2xl border lg:block">
              {/* ヘッダー */}
              <div className="border-border border-b p-4">
                <div className="flex items-center gap-2">
                  <Filter className="text-muted-foreground size-5" />
                  <h3 className="text-foreground font-medium">
                    {totalCount === 1
                      ? tDetail('itemsSingular', { count: totalCount })
                      : tDetail('items', { count: totalCount })}
                  </h3>
                </div>
              </div>

              {/* 人気のタグ */}
              <div className="space-y-6 p-4">
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <TrendingUp className="text-muted-foreground size-4" />
                    <span className="text-muted-foreground text-sm font-medium">
                      {t('popularTags')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {popularTags.map((tagItem) => (
                      <Link key={tagItem.tag} href={`/tags/${encodeURIComponent(tagItem.tag)}`}>
                        <TagPill
                          tag={tagItem.tag}
                          selected={tagItem.tag.toLowerCase() === tag.toLowerCase()}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右メイン */}
        <div className="lg:col-span-3">
          {/* 検索 */}
          <div className="mb-6">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={tDetail('searchContent')}
              clearLabel={tDetail('clearSearch')}
            />
          </div>

          {/* コンテンツ一覧 */}
          {hasContent ? (
            <div>
              {unifiedContent.map((item) => (
                <article key={`${item.type}-${item.slug}`}>
                  <Link
                    href={item.href}
                    className="hover:bg-state-hover block rounded-xl p-4 transition-colors"
                  >
                    {/* タイトル */}
                    <Heading as="h2" size="md" className="text-foreground font-medium">
                      {item.title}
                    </Heading>

                    {/* タグ */}
                    {item.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1">
                        {item.tags.map((tagName) => (
                          <TagPill key={tagName} tag={tagName} />
                        ))}
                      </div>
                    )}

                    {/* 日付 + コンテンツタイプ */}
                    <div className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
                      <time dateTime={item.date}>
                        {new Date(item.date).toLocaleDateString(localeCode, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </time>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        {item.type === 'blog' ? (
                          <FileText className="size-3" />
                        ) : item.type === 'doc' ? (
                          <BookOpen className="size-3" />
                        ) : (
                          <Megaphone className="size-3" />
                        )}
                        {t(
                          item.type === 'blog' ? 'blog' : item.type === 'doc' ? 'docs' : 'releases',
                        )}
                      </span>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title={tDetail('noContentFound')}
              description={tDetail('noContentHint')}
              action={{
                label: tDetail('clearSearch'),
                onClick: () => setSearchQuery(''),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
