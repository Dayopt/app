'use client';

import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useTransition } from 'react';

import dynamic from 'next/dynamic';

import { DateNavigator } from '@/components/common/DateNavigator';
import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { DateRangeDisplay } from '@/components/ui/date-range-display';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppHeader } from '@/shell/components/AppHeader';
import { useShellStore } from '@/shell/stores/useShellStore';

import { useStatsFilterSync } from '../hooks/useStatsFilterSync';
import type { StatsGranularity, StatsTab } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import { StatsGranularitySelector } from './layout/StatsGranularitySelector';
import { useStatsDateDisplayProps } from './layout/useStatsDateDisplayProps';

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
const StatsView = dynamic(() => import('./StatsView').then((m) => ({ default: m.StatsView })), {
  loading: () => <StatsTabSkeleton />,
});
const ProgressView = dynamic(
  () => import('./progress/ProgressView').then((m) => ({ default: m.ProgressView })),
  { loading: () => <StatsTabSkeleton /> },
);
const InsightsView = dynamic(
  () => import('./insights/InsightsView').then((m) => ({ default: m.InsightsView })),
  { loading: () => <StatsTabSkeleton /> },
);
const TagDetailView = dynamic(
  () =>
    import('./tag-detail/TagDetailPageContent').then((m) => ({
      default: m.TagDetailPageContent,
    })),
  { loading: () => <StatsTabSkeleton /> },
);

interface StatsPageContentProps {
  /** ヘッダー右端に追加表示する要素（PageNav等） */
  headerRightExtra?: React.ReactNode;
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
 * 全状態をクエリパラメータで管理:
 * - ?tab=review|progress|insights
 * - ?tag=tagId（Review内のタグドリルダウン）
 * - ?g=day|week|month|year
 * - ?d=YYYY-MM-DD
 */
export function StatsPageContent({ headerRightExtra }: StatsPageContentProps) {
  const t = useTranslations();
  const [, startTransition] = useTransition();

  // URL searchParams ↔ Zustand store の双方向同期
  useStatsFilterSync();

  const tab = useStatsFilterStore((s) => s.tab);
  const selectedTagId = useStatsFilterStore((s) => s.selectedTagId);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setTab = useStatsFilterStore((s) => s.setTab);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const navigate = useStatsFilterStore((s) => s.navigate);

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

  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);
  const dateDisplayProps = useStatsDateDisplayProps(currentDate, granularity);

  const handleTabChange = (value: string) => {
    const newTab = value as StatsTab;
    startTransition(() => {
      setTab(newTab);
    });
  };

  // タグドリルダウン中は Review タブ内に TagDetailView を表示
  const showTagDetail = tab === 'review' && selectedTagId !== null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ヘッダー */}
      <AppHeader leftSlot={sidebarToggle} rightSlot={headerRightExtra}>
        <div className="flex items-center gap-2">
          <DateRangeDisplay {...dateDisplayProps} />
          <DateNavigator onNavigate={navigate} todayLabel={todayLabel} arrowSize="md" />
          {(tab === 'review' || showTagDetail) && (
            <StatsGranularitySelector
              className="ml-2"
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
          )}
        </div>
      </AppHeader>

      {showTagDetail ? (
        /* タグドリルダウン: タブバーの代わりに TagDetailView を表示 */
        <div className="flex min-h-0 flex-1 flex-col">
          <FeatureErrorBoundary featureName="tag-detail">
            <Suspense fallback={<StatsTabSkeleton />}>
              <TagDetailView tagId={selectedTagId} />
            </Suspense>
          </FeatureErrorBoundary>
        </div>
      ) : (
        /* 通常タブ表示 */
        <Tabs value={tab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-10 w-full justify-start gap-4 rounded-none border-none bg-transparent px-4">
            <TabsTrigger value="review" className="text-base">
              {t('calendar.stats.tabReview')}
            </TabsTrigger>
            <TabsTrigger value="progress" className="text-base">
              {t('calendar.stats.tabProgress')}
            </TabsTrigger>
            <TabsTrigger value="insights" className="text-base">
              {t('calendar.stats.tabInsights')}
            </TabsTrigger>
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

          <TabsContent value="insights" className="flex min-h-0 flex-1 flex-col">
            <FeatureErrorBoundary featureName="stats-insights">
              <Suspense fallback={<StatsTabSkeleton />}>
                <InsightsView />
              </Suspense>
            </FeatureErrorBoundary>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
