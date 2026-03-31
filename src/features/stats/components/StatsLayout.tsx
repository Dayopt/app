'use client';

import { PanelLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

import { DateNavigator } from '@/components/common/DateNavigator';
import { DateRangeDisplay } from '@/components/ui/date-range-display';
import { addDays, addMonths, addWeeks } from '@/lib/date/core';
import { cn } from '@/lib/utils';
import { AppHeader } from '@/shell/components/AppHeader';
import { useShellStore } from '@/shell/stores/useShellStore';

import type { StatsGranularity } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import { StatsGranularitySelector } from './layout/StatsGranularitySelector';
import { useStatsDateDisplayProps } from './layout/useStatsDateDisplayProps';

type StatsTabId = 'review' | 'progress' | 'insights';

const TABS: { id: StatsTabId; path: string; labelKey: string }[] = [
  { id: 'review', path: '/stats/review', labelKey: 'calendar.stats.tabReview' },
  { id: 'progress', path: '/stats/progress', labelKey: 'calendar.stats.tabProgress' },
  { id: 'insights', path: '/stats/insights', labelKey: 'calendar.stats.tabInsights' },
];

const TODAY_LABEL_KEYS: Record<StatsGranularity, string> = {
  day: 'common.time.today',
  week: 'common.time.thisWeek',
  month: 'common.time.thisMonth',
  year: 'calendar.stats.thisYear',
};

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

interface StatsLayoutProps {
  activeTab: StatsTabId;
  showGranularity?: boolean;
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Stats 共通レイアウト
 *
 * ヘッダー（日付ナビ + 粒度セレクタ）+ タブナビゲーション（パスベース）+ children。
 * 各タブページがこのレイアウトでラップする。
 */
export function StatsLayout({
  activeTab,
  showGranularity = false,
  headerRightExtra,
  children,
}: StatsLayoutProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = useLocale();

  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);

  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);
  const dateDisplayProps = useStatsDateDisplayProps(currentDate, granularity);

  // 日付ナビゲーション: store + URL を同時更新
  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      const store = useStatsFilterStore.getState();
      const current = store.currentDate;
      const g = store.granularity;

      let newDate: Date;
      if (direction === 'today') {
        newDate = new Date();
      } else {
        const delta = direction === 'next' ? 1 : -1;
        switch (g) {
          case 'day':
            newDate = addDays(current, delta);
            break;
          case 'week':
            newDate = addWeeks(current, delta);
            break;
          case 'month':
            newDate = addMonths(current, delta);
            break;
          case 'year':
            newDate = new Date(current);
            newDate.setFullYear(newDate.getFullYear() + delta);
            break;
        }
      }

      store.setCurrentDate(newDate);

      // URL も更新
      const params = new URLSearchParams(window.location.search);
      params.set('g', g);
      params.set('d', formatDateParam(newDate));
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [pathname],
  );

  const handleGranularityChange = useCallback(
    (newGranularity: StatsGranularity) => {
      setGranularity(newGranularity);

      const params = new URLSearchParams(window.location.search);
      params.set('g', newGranularity);
      params.set('d', formatDateParam(currentDate));
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [setGranularity, currentDate, pathname],
  );

  // タブリンクの href を生成（期間パラメータを維持）
  const buildTabHref = useCallback(
    (tabPath: string) => {
      const params = new URLSearchParams();
      params.set('g', granularity);
      params.set('d', formatDateParam(currentDate));
      return `/${locale}${tabPath}?${params.toString()}`;
    },
    [locale, granularity, currentDate],
  );

  // サイドバートグル
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
      <AppHeader leftSlot={sidebarToggle} rightSlot={headerRightExtra}>
        <div className="flex items-center gap-2">
          <DateRangeDisplay {...dateDisplayProps} />
          <DateNavigator onNavigate={handleNavigate} todayLabel={todayLabel} arrowSize="md" />
          {showGranularity && (
            <StatsGranularitySelector
              className="ml-2"
              granularity={granularity}
              onGranularityChange={handleGranularityChange}
            />
          )}
        </div>
      </AppHeader>

      {/* タブナビゲーション（パスベース、TabsTrigger と同じスタイル） */}
      <nav
        className="flex h-10 w-full items-center justify-start gap-0 bg-transparent px-4"
        role="tablist"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={buildTabHref(tab.path)}
              role="tab"
              aria-selected={isActive}
              prefetch
              className={cn(
                'relative inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-base font-normal whitespace-nowrap transition-all',
                'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
                isActive
                  ? 'text-foreground after:bg-foreground'
                  : 'text-muted-foreground hover:bg-state-hover after:bg-transparent',
              )}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* タブコンテンツ */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
