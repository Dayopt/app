'use client';

import { useTranslations } from 'next-intl';
import { memo, useCallback, useState } from 'react';

import { MEDIA_QUERIES } from '@/lib/breakpoints';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/lib/components/ui/drawer';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

import type { UserSettings } from '@/features/calendar/stores/userSettings';
import type { NavigationDirection } from '@/lib/components/common/DateNavigator';
import { DateNavigator } from '@/lib/components/common/DateNavigator';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { InlineBanner } from '@/lib/components/ui/inline-banner';
import { useInlineBanner } from '@/lib/hooks/useInlineBanner';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import type { CalendarViewType } from '../../types/calendar.types';

import { DateRangeDisplay } from './Header/DateRangeDisplay';
import { MobileCalendarHeader } from './Header/MobileCalendarHeader';
import { ViewSwitcher } from './Header/ViewSwitcher';

const COMPARE_RAIL_DEFAULT_WIDTH = 256;
const COMPARE_RAIL_MIN_WIDTH = 256;
const COMPARE_RAIL_MAX_WIDTH = 560;
const COMPARE_RAIL_RESIZE_STEP = 32;

/** CalendarLayout コンポーネントのプロパティ */
interface CalendarLayoutProps {
  children: React.ReactNode;
  className?: string | undefined;

  // Header props
  viewType: CalendarViewType;
  currentDate: Date;
  onNavigate: (direction: NavigationDirection) => void;
  onViewChange: (view: CalendarViewType) => void;

  // Date selection for mini calendar
  selectedDate?: Date | undefined;
  onDateSelect?: ((date: Date) => void) | undefined;

  // Display range for mini calendar highlight
  displayRange?:
    | {
        start: Date;
        end: Date;
      }
    | undefined;

  // Prefetch callback (hover/touch on nav buttons)
  onPrefetch?: ((direction: NavigationDirection) => void) | undefined;

  // Settings persistence callback
  onSettingsChange?: ((settings: Partial<UserSettings>) => void) | undefined;

  // Header slots
  leftSlot?: React.ReactNode | undefined;
  rightSlot?: React.ReactNode | undefined;

  // Compare rail
  compareRail?: React.ReactNode | undefined;
  mobileCompareRail?: React.ReactNode | undefined;
  compareRailOpen?: boolean | undefined;
  onCompareRailOpenChange?: ((open: boolean) => void) | undefined;
}

/**
 * カレンダー最上位レイアウトコンポーネント
 * ヘッダーとメインコンテンツを管理
 * モバイルでは左右スワイプで期間移動が可能
 */
export const CalendarLayout = memo<CalendarLayoutProps>(
  ({
    children,
    className,

    // Header
    viewType,
    currentDate,
    onNavigate,
    onViewChange,

    // Date selection for mini calendar
    onDateSelect,
    displayRange,

    // Prefetch
    onPrefetch,

    // Settings persistence
    onSettingsChange,

    // Header slots
    leftSlot,
    rightSlot,

    // Compare rail
    compareRail,
    mobileCompareRail,
    compareRailOpen = false,
    onCompareRailOpenChange,
  }) => {
    const t = useTranslations('calendar');
    const tAll = useTranslations();
    const showWeekNumbers = useUserPreferences((s) => s.showWeekNumbers);
    const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);
    const banner = useInlineBanner();
    const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
    const [compareRailWidth, setCompareRailWidth] = useState(COMPARE_RAIL_DEFAULT_WIDTH);

    // ナビゲーション方向 + キーの追跡（スライドアニメーション用）
    const [slide, setSlide] = useState<{ key: number; direction: 'prev' | 'next' | null }>({
      key: 0,
      direction: null,
    });

    // onNavigateをラップして方向を記録
    const handleNavigate = useCallback(
      (direction: NavigationDirection) => {
        if (direction === 'prev' || direction === 'next') {
          setSlide((prev) => ({ key: prev.key + 1, direction }));
        }
        onNavigate(direction);
      },
      [onNavigate],
    );

    // スワイプで前後の期間に移動
    const handleSwipeLeft = useCallback(() => {
      handleNavigate('next');
    }, [handleNavigate]);

    const handleSwipeRight = useCallback(() => {
      handleNavigate('prev');
    }, [handleNavigate]);

    // タッチイベントのみで動作（タッチイベントが発生 = タッチデバイス）
    const { handlers, ref } = useSwipeGesture(handleSwipeLeft, handleSwipeRight);

    const slideClass =
      slide.direction === 'next'
        ? 'calendar-slide-next'
        : slide.direction === 'prev'
          ? 'calendar-slide-prev'
          : '';
    const desktopCompareRailOpen = Boolean(compareRail && !isMobile);
    const contentStyle = desktopCompareRailOpen
      ? ({ marginRight: compareRailWidth } satisfies React.CSSProperties)
      : undefined;
    const compareRailStyle = {
      width: compareRailWidth,
    } satisfies React.CSSProperties;

    const handleCompareRailResizeStart = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;

        event.preventDefault();

        const startX = event.clientX;
        const startWidth = compareRailWidth;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handlePointerMove = (moveEvent: PointerEvent) => {
          setCompareRailWidth(clampCompareRailWidth(startWidth - (moveEvent.clientX - startX)));
        };
        const handlePointerUp = () => {
          document.body.style.cursor = previousCursor;
          document.body.style.userSelect = previousUserSelect;
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp, { once: true });
      },
      [compareRailWidth],
    );

    const handleCompareRailResizeKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setCompareRailWidth((width) => clampCompareRailWidth(width + COMPARE_RAIL_RESIZE_STEP));
          return;
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          setCompareRailWidth((width) => clampCompareRailWidth(width - COMPARE_RAIL_RESIZE_STEP));
          return;
        }

        if (event.key === 'Home') {
          event.preventDefault();
          setCompareRailWidth(COMPARE_RAIL_MIN_WIDTH);
          return;
        }

        if (event.key === 'End') {
          event.preventDefault();
          setCompareRailWidth(COMPARE_RAIL_MAX_WIDTH);
        }
      },
      [],
    );

    return (
      <div
        className={cn('calendar-layout relative flex h-full flex-col overflow-hidden', className)}
      >
        <div className="flex min-h-0 flex-1 flex-col" style={contentStyle}>
          {/* スクリーンリーダー用のページタイトル */}
          <h1 className="sr-only">{t('title')}</h1>

          {/* モバイル: インライン展開ミニカレンダー */}
          <MobileCalendarHeader
            currentDate={currentDate}
            onNavigate={handleNavigate}
            onPrefetch={onPrefetch}
            onDateSelect={onDateSelect}
            displayRange={displayRange}
            rightSlot={rightSlot}
          />

          {/* デスクトップ: 現行AppHeader（変更なし） */}
          <div className="hidden md:block">
            <AppHeader leftSlot={leftSlot} rightSlot={rightSlot}>
              <div className="flex items-center gap-2">
                <DateRangeDisplay
                  date={currentDate}
                  viewType={viewType}
                  showWeekNumber={showWeekNumbers}
                  weekStartsOn={weekStartsOn}
                  clickable={false}
                  displayRange={displayRange}
                />
                <DateNavigator onNavigate={handleNavigate} onPrefetch={onPrefetch} arrowSize="md" />
                <ViewSwitcher
                  className="ml-2"
                  currentView={viewType}
                  onChange={(view) => onViewChange(view as CalendarViewType)}
                  onSettingsChange={onSettingsChange}
                />
              </div>
            </AppHeader>
          </div>

          {/* インラインバナー（同期エラー/オフライン/更新通知） */}
          <InlineBanner {...banner} />

          {/* カレンダーコンテンツ（スワイプ対応） */}
          <div
            ref={ref as React.RefObject<HTMLDivElement>}
            data-calendar-main
            className="flex min-h-0 flex-1 flex-col"
            onTouchStart={handlers.onTouchStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
          >
            <div key={slide.key} className={cn('flex min-h-0 flex-1 flex-row', slideClass)}>
              <div className="flex min-w-0 flex-1 flex-col">{children}</div>
            </div>
          </div>
        </div>

        {compareRail ? (
          <aside
            className="border-border-subtle bg-background absolute top-0 right-0 bottom-0 hidden shrink-0 border-l md:flex"
            style={compareRailStyle}
          >
            {compareRail}
            <div
              role="separator"
              aria-label={tAll('calendar.compare.rail.resizeLabel')}
              aria-orientation="vertical"
              aria-valuemin={COMPARE_RAIL_MIN_WIDTH}
              aria-valuemax={COMPARE_RAIL_MAX_WIDTH}
              aria-valuenow={compareRailWidth}
              tabIndex={0}
              className="hover:bg-state-hover focus-visible:outline-ring absolute inset-y-0 left-0 w-2 -translate-x-1 cursor-col-resize transition-colors duration-150 focus-visible:outline-2"
              onPointerDown={handleCompareRailResizeStart}
              onKeyDown={handleCompareRailResizeKeyDown}
            />
          </aside>
        ) : null}

        {isMobile && mobileCompareRail ? (
          <Drawer
            open={compareRailOpen}
            modal={false}
            handleOnly
            {...(onCompareRailOpenChange ? { onOpenChange: onCompareRailOpenChange } : {})}
          >
            <DrawerContent className="h-3/4">
              <DrawerHeader className="sr-only">
                <DrawerTitle>{tAll('calendar.compare.rail.title')}</DrawerTitle>
                <DrawerDescription>{tAll('calendar.compare.rail.description')}</DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-hidden">{mobileCompareRail}</div>
            </DrawerContent>
          </Drawer>
        ) : null}
      </div>
    );
  },
);

CalendarLayout.displayName = 'CalendarLayout';

function clampCompareRailWidth(width: number): number {
  return Math.min(COMPARE_RAIL_MAX_WIDTH, Math.max(COMPARE_RAIL_MIN_WIDTH, width));
}
