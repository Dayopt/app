'use client';

import { ContentHeader } from '@/components/content/ContentHeader';
import { EmptyState } from '@/components/ui/feedback/empty-state';
import { ContentPagination } from '@/components/ui/navigation/content-pagination';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import type { ReleasePostMetaClient } from '../lib/releases';
import { ReleaseCard } from './ReleaseCard';

const RELEASES_PER_PAGE = 12;

interface ReleasesClientProps {
  initialReleases: ReleasePostMetaClient[];
  locale: string;
}

export function ReleasesClient({ initialReleases, locale }: ReleasesClientProps) {
  const t = useTranslations('releases');
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams?.get('page')) || 1;

  // 日付降順
  const sortedReleases = useMemo(
    () =>
      [...initialReleases].sort(
        (a, b) => new Date(b.frontMatter.date).getTime() - new Date(a.frontMatter.date).getTime(),
      ),
    [initialReleases],
  );

  const totalPages = Math.ceil(sortedReleases.length / RELEASES_PER_PAGE);
  const startIndex = (currentPage - 1) * RELEASES_PER_PAGE;
  const currentReleases = sortedReleases.slice(startIndex, startIndex + RELEASES_PER_PAGE);

  return (
    <div>
      <ContentHeader title={t('header.title')} />

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
      ) : (
        <EmptyState
          icon={FileText}
          title={t('emptyState.title')}
          description={t('emptyState.description')}
        />
      )}
    </div>
  );
}
