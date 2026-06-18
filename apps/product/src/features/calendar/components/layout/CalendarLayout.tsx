'use client';

import { useTranslations } from 'next-intl';
import { memo, useCallback, useState } from 'react';

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
  }) => {
    const t = useTranslations('calendar');
    const showWeekNumbers = useUserPreferences((s) => s.showWeekNumbers);
    const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);
    const banner = useInlineBanner();

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

    return (
      <div className={cn('calendar-layout flex h-full flex-col', className)}>
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
          <div key={slide.key} className={cn('flex min-h-0 flex-1 flex-col', slideClass)}>
            {children}
          </div>
        </div>
      </div>
    );
  },
);

CalendarLayout.displayName = 'CalendarLayout';
