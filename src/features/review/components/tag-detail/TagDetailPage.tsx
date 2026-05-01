'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useMemo } from 'react';

import { FeatureErrorBoundary } from '@/lib/components/common/error-boundary';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import { TagDetailHero } from './TagDetailHero';
import { TagFulfillmentDistribution } from './TagFulfillmentDistribution';
import { TagRecentBlocks } from './TagRecentBlocks';

// recharts (~130KB gzip) を使うチャートは dynamic import で分離
const TagHourlyChart = dynamic(
  () => import('./TagHourlyChart').then((m) => ({ default: m.TagHourlyChart })),
  { ssr: false },
);
const TagDowChart = dynamic(
  () => import('./TagDowChart').then((m) => ({ default: m.TagDowChart })),
  { ssr: false },
);
const TagAccuracyTrendChart = dynamic(
  () => import('./TagAccuracyTrendChart').then((m) => ({ default: m.TagAccuracyTrendChart })),
  { ssr: false },
);

interface TagDetailPageProps {
  tagId: string;
  initialGranularity: ReviewGranularity;
  initialDateStr: string;
}

function parseDateParam(value: string): Date {
  const parsed = new Date(value + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * タグ詳細ページ コンテンツ
 *
 * ヘッダーは ReviewLayout（/review/layout.tsx）が提供。
 * このコンポーネントはナラティブ構造のコンテンツのみ。
 */
export function TagDetailPage({ tagId, initialGranularity, initialDateStr }: TagDetailPageProps) {
  const t = useTranslations();

  const granularity = initialGranularity;
  const currentDate = useMemo(() => parseDateParam(initialDateStr), [initialDateStr]);

  // 子コンポーネント（TagHourlyChart等）が useReviewFilterStore から読むため、
  // URL 値でストアを同期。SSR prefetch と同じキーが使われることを保証。
  const syncGranularity = useReviewFilterStore((s) => s.setGranularity);
  const syncCurrentDate = useReviewFilterStore((s) => s.setCurrentDate);
  useEffect(() => {
    syncGranularity(granularity);
    syncCurrentDate(currentDate);
  }, [granularity, currentDate, syncGranularity, syncCurrentDate]);

  return (
    <div className="scrollbar-stable flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6 p-4">
        {/* ① Hero: 合計時間 + KPI + 子タグバー */}
        <FeatureErrorBoundary featureName="tag-detail-hero">
          <Suspense fallback={<Skeleton className="h-28 w-full rounded-2xl" />}>
            <TagDetailHero tagId={tagId} />
          </Suspense>
        </FeatureErrorBoundary>

        {/* ② Patterns: いつやっているか？ */}
        <section>
          <h3 className="text-muted-foreground mb-4 text-xs font-medium tracking-wider uppercase">
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
          <h3 className="text-muted-foreground mb-4 text-xs font-medium tracking-wider uppercase">
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
