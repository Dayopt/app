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

import { useCalendarKeyboard } from '../hooks/keyboard/useCalendarKeyboard';
import { useCalendarContextMenu } from '../hooks/useCalendarContextMenu';
import { DnDProvider } from '../providers/DnDProvider';
import type { CalendarEvent, CalendarViewType, ViewDateRange } from '../types/calendar.types';

import { CalendarViewRenderer } from './controller/components';
import { initializePreload } from './controller/utils';

import type { CalendarSettings } from '@/stores/useCalendarSettingsStore';
import { CalendarLayout } from './layout/CalendarLayout';
import { EventContextMenu, MobileTouchHint } from './views/shared/components';

// 初回ロード時にビューをプリロード
initializePreload();

// =============================================================================
// Props
// =============================================================================

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
    updates?: { startTime: Date; endTime: Date },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeleteEntry: (entryId: string) => void;
  onRestoreEntry: (entry: CalendarEvent) => Promise<void>;

  // --- Context menu actions ---
  onEditEntry: (entry: CalendarEvent) => void;
  onDeleteEntryConfirm: (entry: CalendarEvent) => void;
  onDuplicateEntry: (entry: CalendarEvent) => void;
  onCopyEntry: (entry: CalendarEvent) => void;

  // --- Navigation handlers ---
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (newView: CalendarViewType) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
  onToggleWeekends: () => void;
  onDateSelect: (date: Date) => void;

  // --- Settings persistence ---
  onSettingsChange?: (settings: Partial<CalendarSettings>) => void;

  // --- Slots ---
  className?: string;
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
  onRestoreEntry,
  onEditEntry,
  onDeleteEntryConfirm,
  onDuplicateEntry,
  onCopyEntry,
  onNavigate,
  onViewChange,
  onNavigatePrev,
  onNavigateNext,
  onNavigateToday,
  onToggleWeekends,
  onSettingsChange,
  onDateSelect,
  className,
  rightSlot,
}: CalendarControllerProps) {
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
      entries: filteredEntries,
      allEntries,
      currentDate,
      showWeekends,
      disabledEntryId,
      onEntryClick,
      onEntryContextMenu: handleEventContextMenu,
      onUpdateEntry,
      onDeleteEntry,
      onRestoreEntry,
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
      onRestoreEntry,
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
        onSettingsChange={onSettingsChange}
        rightSlot={rightSlot}
      >
        <CalendarViewRenderer viewType={viewType} commonProps={commonProps} />
      </CalendarLayout>

      {contextMenuEvent && contextMenuPosition ? (
        <EventContextMenu
          entry={contextMenuEvent}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onEdit={onEditEntry}
          onDelete={onDeleteEntryConfirm}
          onDuplicate={onDuplicateEntry}
          onCopy={onCopyEntry}
        />
      ) : null}

      {/* モバイル操作ヒント（初回のみ表示） */}
      <MobileTouchHint />
    </DnDProvider>
  );
}
