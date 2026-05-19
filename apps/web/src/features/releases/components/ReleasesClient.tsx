'use client';

import { ContentHeader } from '@/components/content/ContentHeader';
import { ContentPagination } from '@/components/ui/content-pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ReleasePostMetaClient, TagCount } from '../lib/releases';
import { ReleaseCard } from './ReleaseCard';
import { ReleaseFilter } from './ReleaseFilter';

const RELEASES_PER_PAGE = 12;

interface ReleasesClientProps {
  initialReleases: ReleasePostMetaClient[];
  initialTags: TagCount[];
  locale: string;
}

export function ReleasesClient({ initialReleases, initialTags, locale }: ReleasesClientProps) {
  const t = useTranslations('releases');
  const searchParams = useSearchParams();

  // フィルター状態
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const currentPage = Number(searchParams?.get('page')) || 1;

  // フィルター + ソート
  const filteredReleases = useMemo(() => {
    const filtered = initialReleases.filter((release) => {
      // タグフィルター
      if (
        selectedTags.length > 0 &&
        !selectedTags.some((tag) => release.frontMatter.tags.includes(tag))
      ) {
        return false;
      }

      return true;
    });

    // ソート処理（日付順）
    filtered.sort((a, b) => {
      const comparison =
        new Date(a.frontMatter.date).getTime() - new Date(b.frontMatter.date).getTime();
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [initialReleases, selectedTags, sortOrder]);

  // ページネーション
  const totalPages = Math.ceil(filteredReleases.length / RELEASES_PER_PAGE);
  const startIndex = (currentPage - 1) * RELEASES_PER_PAGE;
  const currentReleases = filteredReleases.slice(startIndex, startIndex + RELEASES_PER_PAGE);

  // フィルターハンドラー
  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleClearFilters = () => {
    setSelectedTags([]);
  };

  const handleToggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  return (
    <div>
      <ContentHeader title={t('header.title')} />

      {/* 2カラム: フィルター | リスト */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
        {/* 左サイドバー: フィルター */}
        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <ReleaseFilter
              tags={initialTags}
              selectedTags={selectedTags}
              sortOrder={sortOrder}
              onTagToggle={handleTagToggle}
              onClearFilters={handleClearFilters}
              onToggleSortOrder={handleToggleSortOrder}
            />
          </div>
        </div>

        {/* 右側: リリース一覧 */}
        <div className="lg:col-span-3">
          {currentReleases.length > 0 ? (
            <>
              <div className="divide-border divide-y">
                {currentReleases.map((release, index) => (
                  <ReleaseCard
                    key={release.frontMatter.version}
                    release={release}
                    priority={currentPage === 1 && index < 3}
                    layout="list"
                    locale={locale}
                  />
                ))}
              </div>

              {/* ページネーション */}
              {totalPages > 1 && (
                <div className="mt-12">
                  <ContentPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    basePath={locale === 'ja' ? '/ja/releases' : '/releases'}
                  />
                </div>
              )}
            </>
          ) : initialReleases.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t('emptyState.title')}
              description={t('emptyState.description')}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title={t('noResults.title')}
              description={t('noResults.description')}
              action={{
                label: t('noResults.clearFilters'),
                onClick: handleClearFilters,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
