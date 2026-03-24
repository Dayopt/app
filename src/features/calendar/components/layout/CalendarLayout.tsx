'use client';

import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';

import { Search } from 'lucide-react';

import { cn } from '@/lib/utils';

import { DateNavigator } from '@/components/common/DateNavigator';
import { Button } from '@/components/ui/button';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { AppHeader } from '@/shell/components/AppHeader';
import type { CalendarSettings } from '@/stores/useCalendarSettingsStore';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import type { CalendarViewType } from '../../types/calendar.types';

import { DateRangeDisplay } from './Header/DateRangeDisplay';
import { ViewSwitcher } from './Header/ViewSwitcher';

/** CalendarLayout コンポーネントのプロパティ */
export interface CalendarLayoutProps {
  children: React.ReactNode;
  className?: string | undefined;

  // Header props
  viewType: CalendarViewType;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
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

  // Settings persistence callback
  onSettingsChange?: ((settings: Partial<CalendarSettings>) => void) | undefined;

  // Header right slot
  rightSlot?: React.ReactNode | undefined;
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

    // Settings persistence
    onSettingsChange,

    // Header right slot
    rightSlot,
  }) => {
    const t = useTranslations('calendar');
    const { open: openSearch } = useGlobalSearch();
    const showWeekNumbers = useCalendarSettingsStore((s) => s.showWeekNumbers);

    // スワイプで前後の期間に移動
    const handleSwipeLeft = useCallback(() => {
      onNavigate('next');
    }, [onNavigate]);

    const handleSwipeRight = useCallback(() => {
      onNavigate('prev');
    }, [onNavigate]);

    // タッチイベントのみで動作（タッチイベントが発生 = タッチデバイス）
    const { handlers, ref } = useSwipeGesture(handleSwipeLeft, handleSwipeRight);

    return (
      <div className={cn('calendar-layout bg-background flex h-full flex-col', className)}>
        {/* スクリーンリーダー用のページタイトル */}
        <h1 className="sr-only">{t('title')}</h1>

        <AppHeader
          controls={
            <>
              <DateNavigator onNavigate={onNavigate} arrowSize="md" />
              <ViewSwitcher
                className="ml-4"
                currentView={viewType}
                onChange={(view) => onViewChange(view as CalendarViewType)}
                onSettingsChange={onSettingsChange}
              />
            </>
          }
          rightSlot={rightSlot}
          mobileRightSlot={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                icon
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={openSearch}
                aria-label={t('aside.search')}
              >
                <Search className="size-5" />
              </Button>
              <Button
                variant="ghost"
                icon
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate('today')}
                aria-label={t('actions.goToToday')}
              >
                <div className="relative flex size-6 flex-col">
                  <div className="h-1.5 w-full border-b-2 border-current" />
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-xs leading-none font-bold">{new Date().getDate()}</span>
                  </div>
                </div>
              </Button>
            </div>
          }
        >
          <DateRangeDisplay
            date={currentDate}
            viewType={viewType}
            showWeekNumber={showWeekNumbers}
            clickable={true}
            onDateSelect={onDateSelect ? (date) => date && onDateSelect(date) : undefined}
            displayRange={displayRange}
          />
        </AppHeader>

        {/* カレンダーコンテンツ（スワイプ対応） */}
        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          data-calendar-main
          className="flex min-h-0 flex-1 flex-col"
          onTouchStart={handlers.onTouchStart}
          onTouchMove={handlers.onTouchMove}
          onTouchEnd={handlers.onTouchEnd}
        >
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    );
  },
);

CalendarLayout.displayName = 'CalendarLayout';
