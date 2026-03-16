'use client';

/**
 * CalendarController - Calendar View Shell
 *
 * CalendarContext（useCalendar）からデータ・コールバックを取得し、
 * キーボードショートカット・コンテキストメニュー・DnDを設定してUIをレンダリングする。
 *
 * @see contexts/CalendarContext.tsx
 * @see _composition/useCalendarComposition.ts
 */

import { useMemo } from 'react';

import { useCalendar } from '../contexts/CalendarContext';
import { useCalendarKeyboard } from '../hooks/keyboard/useCalendarKeyboard';
import { useCalendarContextMenu } from '../hooks/useCalendarContextMenu';
import { DnDProvider } from '../providers/DnDProvider';

import { CalendarViewRenderer } from './controller/components';
import { initializePreload } from './controller/utils';

import { CalendarLayout } from './layout/CalendarLayout';
import { EventContextMenu, MobileTouchHint } from './views/shared/components';

// 初回ロード時にビューをプリロード
initializePreload();

// =============================================================================
// Component
// =============================================================================

export function CalendarController({
  className,
  rightSlot,
}: { className?: string; rightSlot?: React.ReactNode } = {}) {
  // =========================================================================
  // Context（全データ・コールバックを取得）
  // =========================================================================
  const {
    viewType,
    currentDate,
    viewDateRange,
    filteredEvents,
    allCalendarEvents,
    showWeekends,
    disabledPlanId,
    onPlanClick,
    onTimeRangeSelect,
    onUpdatePlan,
    onDeletePlan,
    onRestorePlan,
    onEditPlan,
    onDeletePlanConfirm,
    onDuplicatePlan,
    onCopyPlan,
    onNavigate,
    onViewChange,
    onNavigatePrev,
    onNavigateNext,
    onNavigateToday,
    onToggleWeekends,
    onDateSelect,
  } = useCalendar();

  // =========================================================================
  // Calendar-internal hooks
  // =========================================================================

  // コンテキストメニュー管理
  const { contextMenuEvent, contextMenuPosition, handleEventContextMenu, handleCloseContextMenu } =
    useCalendarContextMenu();

  // キーボードショートカット（ビューナビゲーション用）
  useCalendarKeyboard({
    viewType,
    onNavigate,
    onViewChange,
    onToggleWeekends,
  });

  // =========================================================================
  // View props（memo化）
  // =========================================================================
  const commonProps = useMemo(
    () => ({
      dateRange: viewDateRange,
      plans: filteredEvents,
      allPlans: allCalendarEvents,
      currentDate,
      showWeekends,
      disabledPlanId,
      onPlanClick,
      onPlanContextMenu: handleEventContextMenu,
      onUpdatePlan,
      onDeletePlan,
      onRestorePlan,
      onTimeRangeSelect,
      onViewChange,
      onNavigatePrev,
      onNavigateNext,
      onNavigateToday,
    }),
    [
      viewDateRange,
      filteredEvents,
      allCalendarEvents,
      currentDate,
      showWeekends,
      disabledPlanId,
      onPlanClick,
      handleEventContextMenu,
      onUpdatePlan,
      onDeletePlan,
      onRestorePlan,
      onTimeRangeSelect,
      onViewChange,
      onNavigatePrev,
      onNavigateNext,
      onNavigateToday,
    ],
  );

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <DnDProvider>
      <CalendarLayout
        className={className}
        viewType={viewType}
        currentDate={currentDate}
        onNavigate={onNavigate}
        onViewChange={onViewChange}
        onDateSelect={onDateSelect}
        displayRange={{
          start: viewDateRange.start,
          end: viewDateRange.end,
        }}
        rightSlot={rightSlot}
      >
        <CalendarViewRenderer viewType={viewType} commonProps={commonProps} />
      </CalendarLayout>

      {contextMenuEvent && contextMenuPosition ? (
        <EventContextMenu
          plan={contextMenuEvent}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onEdit={onEditPlan}
          onDelete={onDeletePlanConfirm}
          onDuplicate={onDuplicatePlan}
          onCopy={onCopyPlan}
        />
      ) : null}

      {/* モバイル操作ヒント（初回のみ表示） */}
      <MobileTouchHint />
    </DnDProvider>
  );
}
