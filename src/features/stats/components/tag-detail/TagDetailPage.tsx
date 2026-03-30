'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

import { DateNavigator } from '@/components/common/DateNavigator';
import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { DateRangeDisplay } from '@/components/ui/date-range-display';
import { Skeleton } from '@/components/ui/skeleton';
import { TagIcon, useTag } from '@/features/tags';
import { resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';
import { AppHeader } from '@/shell/components/AppHeader';

import type { StatsGranularity } from '../../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { StatsGranularitySelector } from '../layout/StatsGranularitySelector';
import { useStatsDateDisplayProps } from '../layout/useStatsDateDisplayProps';
import { TagAccuracyTrendChart } from './TagAccuracyTrendChart';
import { TagDetailHero } from './TagDetailHero';
import { TagDowChart } from './TagDowChart';
import { TagFulfillmentDistribution } from './TagFulfillmentDistribution';
import { TagHourlyChart } from './TagHourlyChart';
import { TagRecentBlocks } from './TagRecentBlocks';

interface TagDetailPageProps {
  tagId: string;
}

const TODAY_LABEL_KEYS: Record<StatsGranularity, string> = {
  day: 'common.time.today',
  week: 'common.time.thisWeek',
  month: 'common.time.thisMonth',
  year: 'calendar.stats.thisYear',
};

/**
 * タグ詳細ページ（独立ルート版）
 *
 * /stats/tags/[tagId] のクライアントエントリポイント。
 * ナラティブ構造: Hero → Patterns → Quality → Timeline → Recent
 */
export function TagDetailPage({ tagId }: TagDetailPageProps) {
  const t = useTranslations();
  const router = useRouter();

  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const navigate = useStatsFilterStore((s) => s.navigate);

  const { data: tag } = useTag(tagId);
  const tagColor = resolveTagColor(tag?.color ?? null);
  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);
  const dateDisplayProps = useStatsDateDisplayProps(currentDate, granularity);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ヘッダー */}
      <AppHeader
        leftSlot={
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground mr-2 flex items-center transition-colors"
            onClick={() => router.back()}
            aria-label={t('calendar.stats.tagDetail.backToReview')}
          >
            <ArrowLeft className="size-5" />
          </button>
        }
      >
        <div className="flex items-center gap-2">
          {/* タグ名 */}
          {tag ? (
            <div className="flex items-center gap-1.5">
              <TagIcon icon={tag.icon} color={tagColor} size="sm" />
              <ColonTagLabel
                name={tag.name}
                className="text-sm font-bold"
                style={{ color: `var(--tag-${tagColor})` }}
              />
            </div>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
          <span className="text-muted-foreground/30">|</span>
          <DateRangeDisplay {...dateDisplayProps} />
          <DateNavigator onNavigate={navigate} todayLabel={todayLabel} arrowSize="md" />
          <StatsGranularitySelector
            className="ml-2"
            granularity={granularity}
            onGranularityChange={setGranularity}
          />
        </div>
      </AppHeader>

      {/* コンテンツ */}
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 p-4">
          {/* ① Hero: 合計時間 + KPI + 子タグバー */}
          <FeatureErrorBoundary featureName="tag-detail-hero">
            <Suspense fallback={<Skeleton className="h-28 w-full rounded-xl" />}>
              <TagDetailHero tagId={tagId} tagName={tag?.name ?? ''} />
            </Suspense>
          </FeatureErrorBoundary>

          {/* ② Patterns: いつやっているか？ */}
          <section>
            <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
              {t('calendar.stats.tagDetail.whenSection')}
            </h3>
            <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2')}>
              <FeatureErrorBoundary featureName="tag-detail-hourly">
                <Suspense fallback={<Skeleton className="h-44 w-full rounded-xl" />}>
                  <TagHourlyChart tagId={tagId} />
                </Suspense>
              </FeatureErrorBoundary>
              <FeatureErrorBoundary featureName="tag-detail-dow">
                <Suspense fallback={<Skeleton className="h-44 w-full rounded-xl" />}>
                  <TagDowChart tagId={tagId} />
                </Suspense>
              </FeatureErrorBoundary>
            </div>
          </section>

          {/* ③ Quality: どれだけうまくいっているか？ */}
          <section>
            <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
              {t('calendar.stats.tagDetail.qualitySection')}
            </h3>
            <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2')}>
              <FeatureErrorBoundary featureName="tag-detail-fulfillment">
                <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
                  <TagFulfillmentDistribution tagId={tagId} />
                </Suspense>
              </FeatureErrorBoundary>
              <FeatureErrorBoundary featureName="tag-detail-accuracy">
                <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
                  <TagAccuracyTrendChart tagId={tagId} />
                </Suspense>
              </FeatureErrorBoundary>
            </div>
          </section>

          {/* ④ Recent: 直近のブロック */}
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
