'use client';

import { PanelLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo } from 'react';

import { DateNavigator } from '@/components/common/DateNavigator';
import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { DateRangeDisplay } from '@/components/ui/date-range-display';
import { Skeleton } from '@/components/ui/skeleton';
import { TagIcon, useTag } from '@/features/tags';
import { addDays, addMonths, addWeeks } from '@/lib/date/core';
import { resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';
import { AppHeader } from '@/shell/components/AppHeader';
import { useShellStore } from '@/shell/stores/useShellStore';

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
  initialGranularity: StatsGranularity;
  initialDateStr: string;
  headerRightExtra?: React.ReactNode;
}

const TODAY_LABEL_KEYS: Record<StatsGranularity, string> = {
  day: 'common.time.today',
  week: 'common.time.thisWeek',
  month: 'common.time.thisMonth',
  year: 'calendar.stats.thisYear',
};

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function parseDateParam(value: string): Date {
  const parsed = new Date(value + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function navigateDate(
  currentDate: Date,
  granularity: StatsGranularity,
  direction: 'prev' | 'next' | 'today',
): Date {
  if (direction === 'today') return new Date();
  const delta = direction === 'next' ? 1 : -1;
  switch (granularity) {
    case 'day':
      return addDays(currentDate, delta);
    case 'week':
      return addWeeks(currentDate, delta);
    case 'month':
      return addMonths(currentDate, delta);
    case 'year': {
      const result = new Date(currentDate);
      result.setFullYear(result.getFullYear() + delta);
      return result;
    }
  }
}

/**
 * タグ詳細ページ（独立ルート版）
 *
 * URL searchParams が唯一の信頼源。
 * SSR prefetch と同じ granularity/date を使うためキャッシュが必ずヒットする。
 */
export function TagDetailPage({
  tagId,
  initialGranularity,
  initialDateStr,
  headerRightExtra,
}: TagDetailPageProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  // URL パラメータから読み取り（サーバーから渡された初期値を使用）
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
  const tagColor = resolveTagColor(tag?.color ?? null);
  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);
  const dateDisplayProps = useStatsDateDisplayProps(currentDate, granularity);

  // URL を更新してページを再レンダリング
  const updateUrl = useCallback(
    (newGranularity: StatsGranularity, newDate: Date) => {
      const params = new URLSearchParams();
      params.set('g', newGranularity);
      params.set('d', formatDateParam(newDate));
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname],
  );

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      const newDate = navigateDate(currentDate, granularity, direction);
      updateUrl(granularity, newDate);
    },
    [currentDate, granularity, updateUrl],
  );

  const handleGranularityChange = useCallback(
    (newGranularity: StatsGranularity) => {
      updateUrl(newGranularity, currentDate);
    },
    [currentDate, updateUrl],
  );

  // サイドバーが閉じているときにトグルボタンを表示
  const sidebarOpen = useShellStore.use.sidebar().open;
  const toggleSidebar = useShellStore.use.toggleSidebar();
  const sidebarToggle = !sidebarOpen ? (
    <button
      type="button"
      onClick={toggleSidebar}
      className="hover:bg-state-hover flex size-8 items-center justify-center rounded-lg transition-colors"
      aria-label="Open sidebar"
    >
      <PanelLeft className="size-4" />
    </button>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ヘッダー */}
      <AppHeader leftSlot={sidebarToggle} rightSlot={headerRightExtra}>
        <div className="flex items-center gap-2">
          <DateRangeDisplay {...dateDisplayProps} />
          <DateNavigator onNavigate={handleNavigate} todayLabel={todayLabel} arrowSize="md" />
          <StatsGranularitySelector
            className="ml-2"
            granularity={granularity}
            onGranularityChange={handleGranularityChange}
          />
        </div>
      </AppHeader>

      {/* コンテンツ */}
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 p-4">
          {/* パンくず: 振り返り > タグ名 */}
          <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => router.push(`/${locale}/stats`)}
            >
              {t('calendar.stats.tagDetail.backToReview')}
            </button>
            <span className="text-muted-foreground/50">/</span>
            {tag ? (
              <div className="flex items-center gap-1.5">
                <TagIcon icon={tag.icon} color={tagColor} size="sm" />
                <ColonTagLabel
                  name={tag.name}
                  className="font-bold"
                  style={{ color: `var(--tag-${tagColor})` }}
                />
              </div>
            ) : (
              <Skeleton className="h-4 w-20" />
            )}
          </nav>
          {/* ① Hero: 合計時間 + KPI + 子タグバー */}
          <FeatureErrorBoundary featureName="tag-detail-hero">
            <Suspense fallback={<Skeleton className="h-28 w-full rounded-2xl" />}>
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
            <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
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
    </div>
  );
}
