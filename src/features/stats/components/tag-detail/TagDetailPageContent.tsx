'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { Skeleton } from '@/components/ui/skeleton';
import { TagIcon, useTag } from '@/features/tags';
import { resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { ChildTagBreakdown } from './ChildTagBreakdown';
import { TagAccuracyTrendChart } from './TagAccuracyTrendChart';
import { TagDetailSummaryCards } from './TagDetailSummaryCards';
import { TagDowChart } from './TagDowChart';
import { TagFulfillmentDistribution } from './TagFulfillmentDistribution';
import { TagHourlyChart } from './TagHourlyChart';
import { TagRecentBlocks } from './TagRecentBlocks';

interface TagDetailPageContentProps {
  tagId: string;
}

/**
 * タグ詳細ドリルダウンビュー
 *
 * Review タブ内のサブビューとして表示される。
 */
export function TagDetailPageContent({ tagId }: TagDetailPageContentProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const selectTag = useStatsFilterStore((s) => s.selectTag);

  const { data: tag } = useTag(tagId);
  const tagColor = resolveTagColor(tag?.color ?? null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Back nav + Tag name */}
      <div className="flex h-10 items-center gap-2 px-4">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
          onClick={() => selectTag(null)}
        >
          <ArrowLeft className="size-4" />
          <span>{t('backToReview')}</span>
        </button>
        <span className="text-muted-foreground/40">|</span>
        {tag ? (
          <div className="flex items-center gap-2">
            <TagIcon icon={tag.icon} color={tagColor} size="sm" />
            <ColonTagLabel
              name={tag.name}
              className="text-sm font-bold"
              style={{ color: `var(--tag-${tagColor})` }}
            />
          </div>
        ) : (
          <Skeleton className="h-5 w-24" />
        )}
      </div>

      {/* コンテンツ */}
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <FeatureErrorBoundary featureName="tag-detail">
            <Suspense fallback={<Skeleton className="h-20 w-full rounded-xl" />}>
              <TagDetailSummaryCards tagId={tagId} />
            </Suspense>
          </FeatureErrorBoundary>

          <FeatureErrorBoundary featureName="tag-detail-children">
            <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
              <ChildTagBreakdown tagId={tagId} tagName={tag?.name ?? ''} />
            </Suspense>
          </FeatureErrorBoundary>

          <FeatureErrorBoundary featureName="tag-detail-accuracy">
            <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
              <TagAccuracyTrendChart tagId={tagId} />
            </Suspense>
          </FeatureErrorBoundary>

          <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2')}>
            <FeatureErrorBoundary featureName="tag-detail-fulfillment">
              <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
                <TagFulfillmentDistribution tagId={tagId} />
              </Suspense>
            </FeatureErrorBoundary>

            <FeatureErrorBoundary featureName="tag-detail-hourly">
              <Suspense fallback={<Skeleton className="h-44 w-full rounded-xl" />}>
                <TagHourlyChart tagId={tagId} />
              </Suspense>
            </FeatureErrorBoundary>
          </div>

          <FeatureErrorBoundary featureName="tag-detail-dow">
            <Suspense fallback={<Skeleton className="h-44 w-full rounded-xl" />}>
              <TagDowChart tagId={tagId} />
            </Suspense>
          </FeatureErrorBoundary>

          <FeatureErrorBoundary featureName="tag-detail-recent">
            <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
              <TagRecentBlocks tagId={tagId} />
            </Suspense>
          </FeatureErrorBoundary>
        </div>
      </div>
    </div>
  );
}
