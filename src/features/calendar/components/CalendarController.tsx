'use client';

/**
 * CalendarController - Calendar View Shell
 *
 * composition layerからprops経由でデータ・コールバックを受け取り、
 * キーボードショートカット・コンテキストメニュー・DnDを設定してUIをレンダリングする。
 *
 * @see _composition/useCalendarComposition.ts
 */

import { useMemo } from 'react';

import { CalendarEntryActionsProvider } from '../contexts/CalendarEntryActionsContext';
import { useCalendarKeyboard } from '../hooks/keyboard/useCalendarKeyboard';
import { useShortcutRegistry } from '../hooks/keyboard/useShortcutRegistry';
import { useCalendarContextMenu } from '../hooks/useCalendarContextMenu';
import type { CalendarEvent, CalendarViewType, ViewDateRange } from '../types/calendar.types';

import { CalendarViewRenderer } from './controller/components';
import { initializePreload } from './controller/utils';

import type { CalendarSettings } from '@/lib/stores/useCalendarSettingsStore';
import { CalendarLayout } from './layout/CalendarLayout';
import { EventContextMenu, MobileTouchHint } from './views/shared/components';

// 初回ロード時にビューをプリロード
initializePreload();

// =============================================================================
// Props
// =============================================================================

/** CalendarController コンポーネントのプロパティ */
export interface CalendarControllerProps {
  /** ビュータイプ */
  viewType: CalendarViewType;
  /** 現在の表示日付 */
  currentDate: Date;

  // --- Data ---
  viewDateRange: ViewDateRange;
  filteredEntries: CalendarEvent[];
  allEntries: CalendarEvent[];

  // --- Settings ---
  showWeekends: boolean;

  // --- Entry state ---
  disabledEntryId: string | null;

  // --- Entry click handlers ---
  onEntryClick: (entry: CalendarEvent) => void;
  onTimeRangeSelect: (selection: {
    date: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }) => void;

  // --- Entry CRUD ---
  onUpdateEntry: (
    entryIdOrEntry: string | CalendarEvent,
    updates?: { startTime: Date; endTime: Date; resetActualTime?: boolean },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeleteEntry: (entryId: string) => void;

  // --- Context menu actions ---
  onDeleteEntryConfirm: (entry: CalendarEvent) => void;

  // --- Navigation handlers ---
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (newView: CalendarViewType) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
  onToggleWeekends: () => void;
  onDateSelect: (date: Date) => void;

  // --- Prefetch ---
  onPrefetch?: ((direction: 'prev' | 'next' | 'today') => void) | undefined;

  // --- Settings persistence ---
  onSettingsChange?: (settings: Partial<CalendarSettings>) => void;

  // --- Slots ---
  className?: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function CalendarController({
  viewType,
  currentDate,
  viewDateRange,
  filteredEntries,
  allEntries,
  showWeekends,
  disabledEntryId,
  onEntryClick,
  onTimeRangeSelect,
  onUpdateEntry,
  onDeleteEntry,
  onDeleteEntryConfirm,
  onNavigate,
  onViewChange,
  onNavigatePrev,
  onNavigateNext,
  onNavigateToday,
  onToggleWeekends,
  onPrefetch,
  onSettingsChange,
  onDateSelect,
  className,
  leftSlot,
  rightSlot,
}: CalendarControllerProps) {
  // =========================================================================
  // Calendar-internal hooks
  // =========================================================================

  // ショートカットレジストリのグローバルリスナー（1箇所のみ呼び出し）
  useShortcutRegistry();

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
  // エントリ操作ハンドラ（Context経由で配信 — View以下でprops不要）
  const entryActions = useMemo(
    () => ({
      onEntryClick,
      onEntryContextMenu: handleEventContextMenu,
      onUpdateEntry,
      onDeleteEntry,
      onTimeRangeSelect,
      disabledEntryId,
    }),
    [
      onEntryClick,
      handleEventContextMenu,
      onUpdateEntry,
      onDeleteEntry,
      onTimeRangeSelect,
      disabledEntryId,
    ],
  );

  // View props（データ + ナビゲーションのみ。エントリ操作はContext経由）
  const commonProps = useMemo(
    () => ({
      dateRange: viewDateRange,
      entries: filteredEntries,
      allEntries,
      currentDate,
      showWeekends,
      disabledEntryId,
      onEntryClick,
      onEntryContextMenu: handleEventContextMenu,
      onUpdateEntry,
      onDeleteEntry,
      onTimeRangeSelect,
      onViewChange,
      onNavigatePrev,
      onNavigateNext,
      onNavigateToday,
    }),
    [
      viewDateRange,
      filteredEntries,
      allEntries,
      currentDate,
      showWeekends,
      disabledEntryId,
      onEntryClick,
      handleEventContextMenu,
      onUpdateEntry,
      onDeleteEntry,
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
    <CalendarEntryActionsProvider value={entryActions}>
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
        onPrefetch={onPrefetch}
        onSettingsChange={onSettingsChange}
        leftSlot={leftSlot}
        rightSlot={rightSlot}
      >
        <CalendarViewRenderer viewType={viewType} commonProps={commonProps} />
      </CalendarLayout>

      {contextMenuEvent && contextMenuPosition ? (
        <EventContextMenu
          entry={contextMenuEvent}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onDelete={onDeleteEntryConfirm}
        />
      ) : null}

      {/* モバイル操作ヒント（初回のみ表示） */}
      <MobileTouchHint />
    </CalendarEntryActionsProvider>
  );
}
