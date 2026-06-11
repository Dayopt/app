'use client';

import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

import { DateNavigator } from '@/lib/components/common/DateNavigator';
import { DateRangeDisplay } from '@/lib/components/common/DateRangeDisplay';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { useShellStore } from '@/lib/stores/useShellStore';

import { writeReviewSearchParams } from '../lib/date-param';
import type { ReviewGranularity } from '../stores/useReviewFilterStore';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';
import { MobileReviewHeader } from './layout/MobileReviewHeader';
import { ReviewGranularitySelector } from './layout/ReviewGranularitySelector';
import { useReviewDateDisplayProps } from './layout/useReviewDateDisplayProps';

const TODAY_LABEL_KEYS: Record<ReviewGranularity, string> = {
  day: 'common.time.today',
  week: 'common.time.thisWeek',
  month: 'common.time.thisMonth',
  year: 'calendar.stats.thisYear',
};

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

  const granularity = useReviewFilterStore((s) => s.granularity);
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const setGranularity = useReviewFilterStore((s) => s.setGranularity);

  const todayLabel = t(TODAY_LABEL_KEYS[granularity]);
  const dateDisplayProps = useReviewDateDisplayProps(currentDate, granularity);

  // store 更新 → 更新後の状態を URL に書く、を常にセットで行う。
  // 日付計算は store の navigate() に一本化（ここで switch を再実装しない）
  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      useReviewFilterStore.getState().navigate(direction);
      const next = useReviewFilterStore.getState();
      writeReviewSearchParams(pathname, next.granularity, next.currentDate);
    },
    [pathname],
  );

  const handleGranularityChange = useCallback(
    (newGranularity: ReviewGranularity) => {
      setGranularity(newGranularity);
      writeReviewSearchParams(pathname, newGranularity, currentDate);
    },
    [setGranularity, currentDate, pathname],
  );

  const handleDateSelect = useCallback(
    (date: Date) => {
      useReviewFilterStore.getState().setCurrentDate(date);
      writeReviewSearchParams(pathname, granularity, date);
    },
    [granularity, pathname],
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
      <MobileReviewHeader
        dateDisplayProps={dateDisplayProps}
        granularity={granularity}
        showGranularity={showGranularity}
        onNavigate={handleNavigate}
        onDateSelect={handleDateSelect}
        onGranularityChange={handleGranularityChange}
      />

      <div className="hidden md:block">
        <AppHeader leftSlot={sidebarToggle} rightSlot={headerRightExtra}>
          <div className="flex items-center gap-2">
            <DateRangeDisplay {...dateDisplayProps} />
            <DateNavigator onNavigate={handleNavigate} todayLabel={todayLabel} arrowSize="md" />
            {showGranularity && (
              <ReviewGranularitySelector
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
