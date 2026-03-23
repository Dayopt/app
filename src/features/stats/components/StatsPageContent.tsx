'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useCallback, useState } from 'react';

import dynamic from 'next/dynamic';

import { DateNavigator } from '@/components/common/DateNavigator';
import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, UnderlineTabsTrigger } from '@/components/ui/tabs';
import { AppHeader } from '@/shell/components/AppHeader';

import { useStatsFilterSync } from '../hooks/useStatsFilterSync';
import type { StatsGranularity, StatsTab } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import { StatsDateDisplay } from './layout/StatsDateDisplay';
import { StatsGranularitySelector } from './layout/StatsGranularitySelector';

/** Stats タブの遅延読み込み用 Skeleton */
function StatsTabSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// recharts (~200KB) を含むタブビューを遅延読み込み
// アクティブタブのみ読み込むことでバンドルサイズを削減
const StatsView = dynamic(() => import('./StatsView').then((m) => ({ default: m.StatsView })), {
  loading: () => <StatsTabSkeleton />,
});
const ProgressView = dynamic(
  () => import('./progress/ProgressView').then((m) => ({ default: m.ProgressView })),
  { loading: () => <StatsTabSkeleton /> },
);
// InsightsView は AI 分析実装後に復活予定
// const InsightsView = dynamic(() =>
//   import('./insights/InsightsView').then((m) => ({ default: m.InsightsView })),
// );

interface StatsPageContentProps {
  /** URL から決定されたアクティブタブ */
  tab: StatsTab;
}

const TODAY_LABEL_KEYS: Record<StatsGranularity, string> = {
  day: 'common.time.today',
  week: 'common.time.thisWeek',
  month: 'common.time.thisMonth',
  year: 'calendar.stats.thisYear',
};

/**
 * Stats ページのクライアントエントリポイント
 *
 * Review / Progress / Insights の3タブ構成。タブはURLベースで切り替え。
 */
export function StatsPageContent({ tab }: StatsPageContentProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<StatsTab>(tab);

  // URL searchParams ↔ Zustand store の双方向同期
  useStatsFilterSync();

  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const navigate = useStatsFilterStore((s) => s.navigate);

  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);

  const handleTabChange = useCallback(
    (value: string) => {
      const newTab = value as StatsTab;
      setActiveTab(newTab);
      window.history.pushState(null, '', `/${locale}/stats/${newTab}`);
    },
    [locale],
  );

  return (
    <div className="bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ヘッダー */}
      <AppHeader
        controls={
          <>
            <DateNavigator onNavigate={navigate} todayLabel={todayLabel} arrowSize="md" />
            {activeTab === 'review' && (
              <StatsGranularitySelector
                className="ml-4"
                granularity={granularity}
                onGranularityChange={setGranularity}
              />
            )}
          </>
        }
      >
        <StatsDateDisplay currentDate={currentDate} granularity={granularity} />
      </AppHeader>

      {/* タブバー */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="h-10 w-full justify-start gap-4 rounded-none border-none bg-transparent px-4">
          <UnderlineTabsTrigger value="review" className="text-base">
            {t('calendar.stats.tabReview')}
          </UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="progress" className="text-base">
            {t('calendar.stats.tabProgress')}
          </UnderlineTabsTrigger>
          {/* Insights タブは AI 分析実装後に復活予定 */}
        </TabsList>

        <TabsContent value="review" className="flex min-h-0 flex-1 flex-col">
          <FeatureErrorBoundary featureName="stats">
            <Suspense fallback={<StatsTabSkeleton />}>
              <StatsView />
            </Suspense>
          </FeatureErrorBoundary>
        </TabsContent>

        <TabsContent value="progress" className="flex min-h-0 flex-1 flex-col">
          <FeatureErrorBoundary featureName="stats-progress">
            <Suspense fallback={<StatsTabSkeleton />}>
              <ProgressView />
            </Suspense>
          </FeatureErrorBoundary>
        </TabsContent>

        {/* Insights タブは AI 分析実装後に復活予定 */}
      </Tabs>
    </div>
  );
}
