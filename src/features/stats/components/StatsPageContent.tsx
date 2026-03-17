'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';

import { DateNavigator } from '@/components/common/DateNavigator';
import { FeatureErrorBoundary } from '@/components/common/error-boundary';
import { Tabs, TabsContent, TabsList, UnderlineTabsTrigger } from '@/components/ui/tabs';
import { AppHeader } from '@/shell/components/AppHeader';

import type { StatsGranularity, StatsTab } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import { StatsDateDisplay } from './layout/StatsDateDisplay';
import { StatsGranularitySelector } from './layout/StatsGranularitySelector';

// recharts (~200KB) を含むタブビューを遅延読み込み
// アクティブタブのみ読み込むことでバンドルサイズを削減
const StatsView = dynamic(() => import('./StatsView').then((m) => ({ default: m.StatsView })));
const ProgressView = dynamic(() =>
  import('./progress/ProgressView').then((m) => ({ default: m.ProgressView })),
);
const InsightsView = dynamic(() =>
  import('./insights/InsightsView').then((m) => ({ default: m.InsightsView })),
);

interface StatsPageContentProps {
  /** URL から決定されたアクティブタブ */
  tab: StatsTab;
  /** ヘッダー右側のカスタムスロット（PageSwitcher など） */
  headerSlot?: React.ReactNode;
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
export function StatsPageContent({ tab, headerSlot }: StatsPageContentProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<StatsTab>(tab);

  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const navigate = useStatsFilterStore((s) => s.navigate);

  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);
  const isReview = activeTab === 'review';

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
          isReview ? (
            <>
              <DateNavigator onNavigate={navigate} todayLabel={todayLabel} arrowSize="md" />
              <StatsGranularitySelector
                className="ml-4"
                granularity={granularity}
                onGranularityChange={setGranularity}
              />
            </>
          ) : undefined
        }
        rightSlot={headerSlot}
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
          <UnderlineTabsTrigger value="insights" className="text-base">
            {t('calendar.stats.tabInsights')}
          </UnderlineTabsTrigger>
        </TabsList>

        <TabsContent value="review" className="flex min-h-0 flex-1 flex-col">
          <FeatureErrorBoundary featureName="stats">
            <StatsView />
          </FeatureErrorBoundary>
        </TabsContent>

        <TabsContent value="progress" className="flex min-h-0 flex-1 flex-col">
          <FeatureErrorBoundary featureName="stats-progress">
            <ProgressView />
          </FeatureErrorBoundary>
        </TabsContent>

        <TabsContent value="insights" className="flex min-h-0 flex-1 flex-col">
          <FeatureErrorBoundary featureName="stats-insights">
            <InsightsView />
          </FeatureErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
