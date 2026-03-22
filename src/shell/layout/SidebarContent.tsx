'use client';

/**
 * サイドバーコンテンツ（Composition Layer）
 *
 * ミニカレンダー + ビュー切り替え + フィルター + パレットを組み立てる。
 * features の組み合わせはこの composition layer で行う。
 */

import { useCallback } from 'react';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import { HoverTooltip } from '@/components/ui/tooltip';
import { CalendarFilterList, useCalendarNavigation, ViewSwitcherList } from '@/features/calendar';
import { Palette } from '@/features/palette';
import { useStatsFilterStore } from '@/features/stats';
import { useTheme } from '@/hooks/useTheme';

/** サイドバーコンテンツ（ミニカレンダー・ビュー切り替え・フィルター・パレットを組み立てる Composition Layer） */
export function SidebarContent() {
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
      {/* ミニカレンダー（PCのみ）- サイドバー上部 */}
      <div className="hidden shrink-0 md:block">
        <MiniCalendar
          selectedDate={miniCalendarDate}
          onDateSelect={(date) => {
            if (date) handleDateSelect(date);
          }}
          className="w-full bg-transparent"
        />
      </div>

      {/* ビュー切り替え・フィルター */}
      <div className="flex min-w-0 flex-col overflow-hidden">
        {/* ビュー切り替え（モバイルのみ） */}
        <ViewSwitcherList />

        {/* カレンダーフィルター */}
        <CalendarFilterList />
      </div>

      {/* パレット（よく使うブロックのクイック配置） */}
      <Palette />

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
