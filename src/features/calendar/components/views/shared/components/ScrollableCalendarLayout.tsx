/**
 * 統一されたスクロール可能カレンダーレイアウト
 *
 * リファクタリング済み: ロジックは専用フックに分離
 * - useScrollableCalendar: スクロール管理・キーボードナビゲーション
 * - useCurrentTimeLine: 現在時刻線のロジック
 * - useSleepHoursLayout: グリッドレイアウト計算
 */

'use client';

import React, { useCallback, useMemo } from 'react';

import { getChronotypeProfile } from '@/features/chronotype';
import { cn } from '@/lib/utils';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { formatTimeString } from '../../../../interaction/time-math';

import { TIME_COLUMN_WIDTH, Z_INDEX } from '../constants/grid.constants';
import { CurrentTimeLine } from '../grid/CurrentTimeLine';
import { NowBadge } from '../grid/CurrentTimeLine/NowBadge';
import { TimeColumn } from '../grid/TimeColumn/TimeColumn';
import { useChronotypeGradient } from '../hooks/useChronotypeGradient';
import { useCurrentTimeLine } from '../hooks/useCurrentTimeLine';
import { useResponsiveHourHeight } from '../hooks/useResponsiveHourHeight';
import { useScrollableCalendar } from '../hooks/useScrollableCalendar';
import { useSleepHoursLayout } from '../hooks/useSleepHoursLayout';
import { TimezoneOffset } from './TimezoneOffset';

/** ScrollableCalendarLayout コンポーネントのプロパティ */
interface ScrollableCalendarLayoutProps {
  children: React.ReactNode;
  className?: string | undefined;
  showTimeColumn?: boolean | undefined;
  showCurrentTime?: boolean | undefined;
  showTimezone?: boolean | undefined;
  timeColumnWidth?: number | undefined;
  onTimeClick?: ((hour: number, minute: number) => void) | undefined;
  displayDates?: Date[] | undefined;
  viewMode?: 'day' | '3day' | '5day' | 'week' | undefined;

  // スクロール機能の追加
  enableKeyboardNavigation?: boolean | undefined;
  onScrollPositionChange?: ((scrollTop: number) => void) | undefined;
}

interface CalendarDateHeaderProps {
  header: React.ReactNode;
  showTimeColumn?: boolean | undefined;
  showTimezone?: boolean | undefined;
  timeColumnWidth?: number | undefined;
  /** 週番号（表示する場合） */
  weekNumber?: number | undefined;
}

/**
 * カレンダー日付ヘッダー（固定）
 */
export const CalendarDateHeader = ({
  header,
  showTimeColumn = true,
  showTimezone = true,
  timeColumnWidth = TIME_COLUMN_WIDTH,
  weekNumber,
}: CalendarDateHeaderProps) => {
  const showWeekNumbers = useCalendarSettingsStore((s) => s.showWeekNumbers);

  // 設定がオンで週番号が渡されている場合のみ表示
  const shouldShowWeekNumber = showWeekNumbers && weekNumber != null;

  return (
    <div className="flex h-12 shrink-0 flex-col justify-end">
      <div className="flex items-end">
        {/* 左スペーサー（時間列と揃えるため） */}
        {showTimeColumn ? (
          <div
            className="flex h-8 shrink-0 flex-col items-center justify-center"
            style={{ width: timeColumnWidth }}
          >
            {/* 週番号バッジ（Googleカレンダースタイル） - モバイルのみ表示 */}
            {shouldShowWeekNumber ? (
              <span className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-xs font-normal md:hidden">
                {weekNumber}
              </span>
            ) : null}
            {/* タイムゾーン表示（PC: 常に表示、モバイル: 週番号がない場合のみ） */}
            {showTimezone ? (
              <TimezoneOffset className={cn('w-full', shouldShowWeekNumber && 'hidden md:flex')} />
            ) : null}
          </div>
        ) : null}

        {/* 各ビューが独自のヘッダーを配置するエリア */}
        <div className="flex-1">{header}</div>
      </div>
    </div>
  );
};

/**
 * スクロール可能カレンダーコンテンツ
 */
export const ScrollableCalendarLayout = ({
  children,
  className = '',
  showTimeColumn = true,
  showCurrentTime = true,
  showTimezone: _showTimezone = true,
  timeColumnWidth = TIME_COLUMN_WIDTH,
  onTimeClick,
  displayDates = [],
  viewMode = 'week',
  enableKeyboardNavigation = true,
  onScrollPositionChange,
}: ScrollableCalendarLayoutProps) => {
  const HOUR_HEIGHT = useResponsiveHourHeight();

  // グリッドレイアウト計算（フック利用）
  const { gridHeight, todayColumnPosition, hasToday } = useSleepHoursLayout({
    hourHeight: HOUR_HEIGHT,
    displayDates,
  });

  // スクロール管理・キーボードナビゲーション（フック利用）
  const { scrollContainerRef, handleKeyDown } = useScrollableCalendar({
    viewMode,
    hourHeight: HOUR_HEIGHT,
    enableKeyboardNavigation,
    onScrollPositionChange,
  });

  // 現在時刻線ロジック（フック利用）
  const { currentTime, currentTimePosition } = useCurrentTimeLine({
    hourHeight: HOUR_HEIGHT,
    showCurrentTime,
  });

  // Chronotype gradient（ゾーン外は transparent で bg-background を透過）
  const gradientCss = useChronotypeGradient();

  // Chronotype ゾーン配列（TimeColumn ラベル装飾用）
  const chronotype = useCalendarSettingsStore((s) => s.chronotype);
  const chronotypeZones = useMemo(() => {
    if (!chronotype.enabled) return undefined;
    return getChronotypeProfile(chronotype.type, chronotype.customZones).productivityZones;
  }, [chronotype]);

  // 現在時刻のフォーマット（設定に応じて 24h/12h）
  const timeFormat = useCalendarSettingsStore((s) => s.timeFormat);
  const formattedCurrentTime = formatTimeString(
    currentTime.getHours(),
    currentTime.getMinutes(),
    timeFormat,
  );

  // グリッドクリックハンドラー
  const handleGridClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onTimeClick || !scrollContainerRef.current) return;

      const rect = scrollContainerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + scrollContainerRef.current.scrollTop;
      const x = e.clientX - rect.left;

      // 時間列以外の領域のクリックのみ処理
      if (showTimeColumn && x < timeColumnWidth) return;

      // 15分単位でスナップ
      const totalMinutes = Math.max(0, Math.floor((y / HOUR_HEIGHT) * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.round((totalMinutes % 60) / 15) * 15;

      if (hours >= 0 && hours < 24) {
        onTimeClick(hours, minutes);
      }
    },
    [onTimeClick, HOUR_HEIGHT, showTimeColumn, timeColumnWidth, scrollContainerRef],
  );

  // 現在時刻線を表示するか判定
  const shouldShowCurrentTimeLine = showCurrentTime;

  return (
    <div
      ref={scrollContainerRef}
      className={cn('calendar-scrollbar relative min-h-0 flex-1 overflow-y-auto', className)}
      data-calendar-scroll
    >
      <div
        className="relative flex w-full"
        style={{ height: `${gridHeight}px` }}
        onClick={handleGridClick}
        onKeyDown={handleKeyDown}
        tabIndex={enableKeyboardNavigation ? 0 : -1}
        role={enableKeyboardNavigation ? 'grid' : undefined}
        aria-label={enableKeyboardNavigation ? `${viewMode} view calendar` : undefined}
      >
        {/* 時間軸列 */}
        {showTimeColumn && (
          <div
            className="border-border sticky left-0 z-10 shrink-0 border-r"
            style={{ width: timeColumnWidth }}
          >
            <div className="relative h-full overflow-hidden">
              <TimeColumn
                startHour={0}
                endHour={24}
                hourHeight={HOUR_HEIGHT}
                format="24h"
                className="h-full"
                zones={chronotypeZones}
              />
              {/* 現在時刻ラベル（Apple Calendar風） */}
              {shouldShowCurrentTimeLine && hasToday && (
                <div
                  className="bg-now-indicator text-now-indicator-foreground pointer-events-none absolute right-1 z-20 rounded-lg px-1 py-0.5 text-xs font-bold"
                  style={{
                    top: `${currentTimePosition}px`,
                    transform: 'translateY(-50%)',
                  }}
                  aria-hidden="true"
                >
                  {formattedCurrentTime}
                </div>
              )}
            </div>
          </div>
        )}

        {/* グリッドコンテンツエリア */}
        <div className="relative flex flex-1 flex-col">
          {/* Chronotype gradient 背景（ゾーン外は transparent） */}
          {gradientCss && (
            <div
              className="pointer-events-none absolute inset-0 z-0"
              style={{ backgroundImage: gradientCss }}
              aria-hidden="true"
            />
          )}

          {/* メインコンテンツ（flex で横並びを維持） */}
          <div className="relative flex h-full" role={enableKeyboardNavigation ? 'row' : undefined}>
            {children}
          </div>

          {/* 縦の区切り線 */}
          {displayDates && displayDates.length > 1 && (
            <div className="pointer-events-none absolute inset-0 z-5 flex">
              {displayDates.map((date, index) => (
                <div
                  key={date.toISOString()}
                  className={cn(
                    'flex-1',
                    index < displayDates.length - 1 && 'border-border border-r',
                  )}
                />
              ))}
            </div>
          )}

          {/* 現在時刻線 + Now Badge */}
          {shouldShowCurrentTimeLine && displayDates && displayDates.length > 0 ? (
            <>
              <CurrentTimeLine
                hourHeight={HOUR_HEIGHT}
                displayDates={displayDates}
                viewMode={viewMode}
                showDot={viewMode !== 'day'}
              />
              {/* Now Badge（deep/ease ゾーン内のみ、今日の列に配置） */}
              {hasToday && todayColumnPosition && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    top: `${currentTimePosition}px`,
                    left: todayColumnPosition.left,
                    zIndex: Z_INDEX.CURRENT_TIME,
                  }}
                >
                  <NowBadge currentHour={currentTime.getHours() + currentTime.getMinutes() / 60} />
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
