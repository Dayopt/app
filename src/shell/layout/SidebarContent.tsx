'use client';

/**
 * サイドバーコンテンツ（Composition Layer）
 *
 * ミニカレンダー + ビュー切り替え + フィルター + パレットを組み立てる。
 * features の組み合わせはこの composition layer で行う。
 */

import { useCallback } from 'react';

import { toast } from '@/lib/toast';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import { HoverTooltip } from '@/components/ui/tooltip';
import { CalendarFilterList, useCalendarNavigation, ViewSwitcherList } from '@/features/calendar';
import { RecentBlocks } from '@/features/history';
import { Palette, usePaletteMutations } from '@/features/palette';
import { useStatsFilterStore } from '@/features/stats';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/hooks/useTheme';
import { SidebarSection } from '@/shell/components/sidebar';

/** サイドバーコンテンツ（ミニカレンダー・ビュー切り替え・フィルター・パレットを組み立てる Composition Layer） */
export function SidebarContent() {
  const t = useTranslations();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const navigation = useCalendarNavigation();
  const { pinItem } = usePaletteMutations();

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

  // 履歴からのピン留め — 成功時にtoastで通知
  const handlePinFromHistory = useCallback(
    (tagId: string, durationMinutes: number) => {
      pinItem(tagId, durationMinutes, {
        onSuccess: () => toast.success(t('sidebar.recentBlocks.pinned')),
      });
    },
    [pinItem, t],
  );

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

      {/* パレット（ピン留めブロックのクイック配置） */}
      <Palette />

      {/* 履歴（頻度×鮮度ベースの自動集計） — モバイルでは非表示 */}
      {!isMobile && <RecentBlocks onPinItem={handlePinFromHistory} />}

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
