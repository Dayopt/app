'use client';

import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

import { AppHeader } from '@/components/shell/AppHeader';
import { DateRangeDisplay } from '@/components/ui/display/DateRangeDisplay';
import { DateNavigator } from '@/components/ui/navigation/DateNavigator';
import { useShellStore } from '@/lib/stores/useShellStore';

import { writeReviewSearchParams } from '../lib/date-param';
import type { ReviewGranularity } from '../stores/useReviewFilterStore';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';
import { MobileReviewHeader } from './layout/MobileReviewHeader';
import { useReviewDateDisplayProps } from './layout/useReviewDateDisplayProps';

const TODAY_LABEL_KEYS: Record<ReviewGranularity, string> = {
  week: 'common.time.thisWeek',
};

interface ReviewLayoutProps {
  headerRightExtra?: ReactNode;
  children: ReactNode;
}

/**
 * Review レイアウト
 *
 * 週次 Review 用の日付ナビを含む共通ヘッダーを提供する。
 * 日次の予定 vs 実績確認は Calendar day compare mode に寄せる。
 */
export function ReviewLayout({ headerRightExtra, children }: ReviewLayoutProps) {
  const t = useTranslations();
  const pathname = usePathname();

  const granularity = useReviewFilterStore((s) => s.granularity);
  const currentDate = useReviewFilterStore((s) => s.currentDate);

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
        onNavigate={handleNavigate}
        onDateSelect={handleDateSelect}
      />

      <div className="hidden md:block">
        <AppHeader leftSlot={sidebarToggle} rightSlot={headerRightExtra}>
          <div className="flex items-center gap-2">
            <DateRangeDisplay {...dateDisplayProps} />
            <DateNavigator onNavigate={handleNavigate} todayLabel={todayLabel} arrowSize="md" />
          </div>
        </AppHeader>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
