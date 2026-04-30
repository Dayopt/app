'use client';

import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

import { DateNavigator } from '@/lib/components/common/DateNavigator';
import { DateRangeDisplay } from '@/lib/components/common/DateRangeDisplay';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { addDays, addMonths, addWeeks } from '@/lib/date/core';
import { useShellStore } from '@/lib/stores/useShellStore';

import type { StatsGranularity } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import { MobileStatsHeader } from './layout/MobileStatsHeader';
import { StatsGranularitySelector } from './layout/StatsGranularitySelector';
import { useStatsDateDisplayProps } from './layout/useStatsDateDisplayProps';

const TODAY_LABEL_KEYS: Record<StatsGranularity, string> = {
  day: 'common.time.today',
  week: 'common.time.thisWeek',
  month: 'common.time.thisMonth',
  year: 'calendar.stats.thisYear',
};

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

interface ReviewLayoutProps {
  showGranularity?: boolean;
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Review レイアウト
 *
 * 日付ナビ + 粒度セレクタを含む共通ヘッダーを提供する。
 * タブは持たない（Review 単一ページ前提）。
 */
export function ReviewLayout({
  showGranularity = true,
  headerRightExtra,
  children,
}: ReviewLayoutProps) {
  const t = useTranslations();
  const pathname = usePathname();

  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);

  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);
  const dateDisplayProps = useStatsDateDisplayProps(currentDate, granularity);

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
      <MobileStatsHeader
        dateDisplayProps={dateDisplayProps}
        granularity={granularity}
        showGranularity={showGranularity}
        onNavigate={handleNavigate}
        onGranularityChange={handleGranularityChange}
      />

      <div className="hidden md:block">
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
