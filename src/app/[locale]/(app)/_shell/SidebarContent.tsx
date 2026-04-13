'use client';

/**
 * サイドバーコンテンツ（Composition Layer）
 *
 * ミニカレンダー + ビュー切り替え + フィルター + 履歴を組み立てる。
 * features の組み合わせはこの composition layer で行う。
 */

import { useCallback } from 'react';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { CalendarFilterList, useCalendarNavigation, ViewSwitcherList } from '@/features/calendar';
import { RecentBlocks } from '@/features/history';
import { useStatsFilterStore } from '@/features/stats';
import { SidebarSection } from '@/lib/components/shell/sidebar';
import { Button } from '@/lib/components/ui/button';
import { MiniCalendar } from '@/lib/components/ui/mini-calendar';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { useTheme } from '@/lib/hooks/useTheme';

/** サイドバーコンテンツ（ミニカレンダー・ビュー切り替え・フィルター・履歴を組み立てる Composition Layer） */
export function SidebarContent() {
  const t = useTranslations();
  const pathname = usePathname();
  const navigation = useCalendarNavigation();
  const isStatsPage = pathname?.includes('/stats') ?? false;
  const statsCurrentDate = useStatsFilterStore((s) => s.currentDate);
  const statsSetCurrentDate = useStatsFilterStore((s) => s.setCurrentDate);

  const miniCalendarDate = isStatsPage ? statsCurrentDate : navigation?.currentDate;
  const handleDateSelect = (date: Date) => {
    if (isStatsPage) {
      statsSetCurrentDate(date);
    } else if (navigation) {
      navigation.navigateToDate(date, true);
    }
  };

  return (
    <>
      {/* ミニカレンダー（PCのみ） */}
      <div className="hidden px-2 md:block">
        <SidebarSection title={t('sidebar.calendar.title')} defaultOpen>
          <MiniCalendar
            selectedDate={miniCalendarDate}
            onDateSelect={(date) => {
              if (date) handleDateSelect(date);
            }}
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- calc expression
            className="-mx-2 w-[calc(100%+16px)] bg-transparent"
          />
        </SidebarSection>
      </div>

      {/* ビュー切り替え・フィルター */}
      <div className="flex min-w-0 flex-col overflow-hidden px-2">
        {/* ビュー切り替え（モバイルのみ） */}
        <ViewSwitcherList />

        {/* カレンダーフィルター */}
        <CalendarFilterList />
      </div>

      {/* 履歴（頻度×鮮度ベースの自動集計） */}
      <RecentBlocks />

      {/* テーマ切替 */}
      <SidebarUtilities />
    </>
  );
}

/** テーマ切替ユーティリティ */
function SidebarUtilities() {
  const t = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();

  const handleThemeToggle = useCallback(() => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  }, [resolvedTheme, setTheme]);

  return (
    <div className="flex items-center gap-1 px-2 py-2">
      <HoverTooltip content={resolvedTheme === 'light' ? 'Dark mode' : 'Light mode'} side="right">
        <Button
          variant="ghost"
          icon
          className="size-8"
          onClick={handleThemeToggle}
          aria-label={t('navigation.sidebar.theme')}
        >
          {resolvedTheme === 'light' ? (
            <Moon className="size-4" aria-hidden="true" />
          ) : (
            <Sun className="size-4" aria-hidden="true" />
          )}
        </Button>
      </HoverTooltip>
    </div>
  );
}
