'use client';

import { PanelLeft, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { DateNavigator } from '@/components/common/DateNavigator';
import { DateRangeDisplay } from '@/components/common/DateRangeDisplay';
import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { TagIcon } from '@/features/tags';
import { addDays, addMonths, addWeeks } from '@/lib/date/core';
import { cn } from '@/lib/utils';
import { AppHeader } from '@/shell/components/AppHeader';
import { useShellStore } from '@/shell/stores/useShellStore';

import type { StatsGranularity } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import { MobileStatsHeader } from './layout/MobileStatsHeader';
import { StatsGranularitySelector } from './layout/StatsGranularitySelector';
import { useStatsDateDisplayProps } from './layout/useStatsDateDisplayProps';

type StatsTabId = 'review' | 'progress' | 'badges' | 'insights' | 'tag';

const FIXED_TABS: { id: Exclude<StatsTabId, 'tag'>; path: string; labelKey: string }[] = [
  { id: 'review', path: '/stats/review', labelKey: 'calendar.stats.tabReview' },
  { id: 'progress', path: '/stats/progress', labelKey: 'calendar.stats.tabProgress' },
  { id: 'badges', path: '/stats/badges', labelKey: 'calendar.stats.tabBadges' },
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

/** 動的タグタブの情報 */
export interface TagTabInfo {
  tagId: string;
  tagName: string;
  tagIcon: string | null;
  tagColor: string;
}

interface StatsLayoutProps {
  activeTab: StatsTabId;
  tagTab?: TagTabInfo | undefined;
  showGranularity?: boolean;
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Stats 共通レイアウト
 *
 * ヘッダー（日付ナビ + 粒度セレクタ）+ タブナビゲーション（パスベース）+ children。
 * タグ詳細は動的4つ目タブとして表示。
 */
export function StatsLayout({
  activeTab,
  tagTab,
  showGranularity = false,
  headerRightExtra,
  children,
}: StatsLayoutProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = useLocale();
  const router = useRouter();

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

  // タグタブを閉じる → review に戻る
  const handleCloseTagTab = useCallback(() => {
    router.push(buildTabHref('/stats/review'));
  }, [router, buildTabHref]);

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

  const tabLinkClass = (isActive: boolean) =>
    cn(
      'relative inline-flex items-center justify-center rounded-lg px-2 py-1 text-base font-normal whitespace-nowrap transition-all',
      'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
      isActive
        ? 'text-foreground after:bg-foreground'
        : 'text-muted-foreground hover:bg-state-hover after:bg-transparent',
    );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* モバイルヘッダー */}
      <MobileStatsHeader
        dateDisplayProps={dateDisplayProps}
        granularity={granularity}
        showGranularity={showGranularity}
        onNavigate={handleNavigate}
        onGranularityChange={handleGranularityChange}
      />

      {/* デスクトップヘッダー */}
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

      {/* タブナビゲーション */}
      <nav
        className="scrollbar-hide flex h-8 w-full items-center justify-start gap-0 overflow-x-auto bg-transparent px-4 md:h-10"
        role="tablist"
      >
        {/* 固定3タブ */}
        {FIXED_TABS.map((tab, i) => (
          <Link
            key={tab.id}
            href={buildTabHref(tab.path)}
            role="tab"
            aria-selected={activeTab === tab.id}
            prefetch
            className={cn(tabLinkClass(activeTab === tab.id), i === 0 && 'pl-0 after:left-0')}
          >
            {t(tab.labelKey)}
          </Link>
        ))}

        {/* 動的タグタブ */}
        {tagTab && (
          <div className="flex items-center">
            <Link
              href={buildTabHref(`/stats/tags/${tagTab.tagId}`)}
              role="tab"
              aria-selected={activeTab === 'tag'}
              prefetch
              className={tabLinkClass(activeTab === 'tag')}
            >
              <TagIcon icon={tagTab.tagIcon} color={tagTab.tagColor} size="sm" />
              <ColonTagLabel name={tagTab.tagName} className="ml-1 text-sm" />
            </Link>
            <button
              type="button"
              onClick={handleCloseTagTab}
              // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element touch target
              className="text-muted-foreground hover:bg-state-hover hover:text-foreground relative -ml-1 flex size-5 items-center justify-center rounded-lg transition-colors before:absolute before:-inset-3 before:content-['']"
              aria-label="Close tag tab"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </nav>

      {/* タブコンテンツ */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
