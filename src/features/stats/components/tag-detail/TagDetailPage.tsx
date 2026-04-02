'use client';

import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo } from 'react';

import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { useTag } from '@/features/tags';
import { cn } from '@/lib/utils';

import type { StatsGranularity } from '../../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { TagAccuracyTrendChart } from './TagAccuracyTrendChart';
import { TagDetailHero } from './TagDetailHero';
import { TagDowChart } from './TagDowChart';
import { TagFulfillmentDistribution } from './TagFulfillmentDistribution';
import { TagHourlyChart } from './TagHourlyChart';
import { TagRecentBlocks } from './TagRecentBlocks';

interface TagDetailPageProps {
  tagId: string;
  initialGranularity: StatsGranularity;
  initialDateStr: string;
}

function parseDateParam(value: string): Date {
  const parsed = new Date(value + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * タグ詳細ページ コンテンツ
 *
 * ヘッダーとタブバーは StatsLayout（layout.tsx）が提供。
 * このコンポーネントはナラティブ構造のコンテンツのみ。
 */
export function TagDetailPage({ tagId, initialGranularity, initialDateStr }: TagDetailPageProps) {
  const t = useTranslations();

  const granularity = initialGranularity;
  const currentDate = useMemo(() => parseDateParam(initialDateStr), [initialDateStr]);

  // 子コンポーネント（TagHourlyChart等）が useStatsFilterStore から読むため、
  // URL 値でストアを同期。SSR prefetch と同じキーが使われることを保証。
  const syncGranularity = useStatsFilterStore((s) => s.setGranularity);
  const syncCurrentDate = useStatsFilterStore((s) => s.setCurrentDate);
  useEffect(() => {
    syncGranularity(granularity);
    syncCurrentDate(currentDate);
  }, [granularity, currentDate, syncGranularity, syncCurrentDate]);

  const { data: tag } = useTag(tagId);

  return (
    <div className="scrollbar-stable flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6 p-4">
        {/* ① Hero: 合計時間 + KPI + 子タグバー */}
        <FeatureErrorBoundary featureName="tag-detail-hero">
          <Suspense fallback={<Skeleton className="h-28 w-full rounded-2xl" />}>
            <TagDetailHero tagId={tagId} tagName={tag?.name ?? ''} />
          </Suspense>
        </FeatureErrorBoundary>

        {/* ② Patterns: いつやっているか？ */}
        <section>
          <h3 className="text-muted-foreground mb-4 text-xs font-bold tracking-wider uppercase">
            {t('calendar.stats.tagDetail.whenSection')}
          </h3>
          <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2')}>
            <FeatureErrorBoundary featureName="tag-detail-hourly">
              <Suspense fallback={<Skeleton className="h-44 w-full rounded-2xl" />}>
                <TagHourlyChart tagId={tagId} />
              </Suspense>
            </FeatureErrorBoundary>
            <FeatureErrorBoundary featureName="tag-detail-dow">
              <Suspense fallback={<Skeleton className="h-44 w-full rounded-2xl" />}>
                <TagDowChart tagId={tagId} />
              </Suspense>
            </FeatureErrorBoundary>
          </div>
        </section>

        {/* ③ Quality: どれだけうまくいっているか？ */}
        <section>
          <h3 className="text-muted-foreground mb-4 text-xs font-bold tracking-wider uppercase">
            {t('calendar.stats.tagDetail.qualitySection')}
          </h3>
          <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2')}>
            <FeatureErrorBoundary featureName="tag-detail-fulfillment">
              <Suspense fallback={<Skeleton className="h-32 w-full rounded-2xl" />}>
                <TagFulfillmentDistribution tagId={tagId} />
              </Suspense>
            </FeatureErrorBoundary>
            <FeatureErrorBoundary featureName="tag-detail-accuracy">
              <Suspense fallback={<Skeleton className="h-48 w-full rounded-2xl" />}>
                <TagAccuracyTrendChart tagId={tagId} />
              </Suspense>
            </FeatureErrorBoundary>
          </div>
        </section>

        {/* ④ Recent: 直近のブロック */}
        <FeatureErrorBoundary featureName="tag-detail-recent">
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
            <TagRecentBlocks tagId={tagId} />
          </Suspense>
        </FeatureErrorBoundary>
      </div>
    </div>
  );
}
