'use client';

/**
 * Calendar CRUD Handlers Hook
 *
 * Timeblock のクリック・作成・更新・削除・コンテキストメニュー操作を担当。
 * キーボードショートカット（Timeblock操作系）もここに集約。
 */

import { useCallback, useMemo } from 'react';

import { addHours, startOfHour } from 'date-fns';

import type { CalendarEvent } from '@/features/calendar';
import {
  buildClipboardTimeblock,
  useCalendarEventKeyboard,
  useCalendarHandlers,
  useTimeblockContextActions,
  useTimeblockOperations,
} from '@/features/calendar';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';

// =============================================================================
// Types
// =============================================================================

interface CalendarCrudHandlersInput {
  /** Inspector で選択中の Timeblock ID */
  selectedTimeblockId: string | null;
  /** フィルタ済みイベント一覧（キーボード操作でタイトル取得に使用） */
  filteredEvents: CalendarEvent[];
  /** 現在の表示日付（キーボード操作で過去日判定に使用） */
  currentDate: Date;
}

interface CalendarCrudHandlersResult {
  disabledTimeblockId: string | null;
  onEntryClick: (entry: CalendarEvent) => void;
  onTimeRangeSelect: (selection: {
    date: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }) => void;
  onUpdateEntry: (
    timeblockIdOrTimeblock: string | CalendarEvent,
    updates?: { startTime: Date; endTime: Date; resetActualTime?: boolean },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeleteTimeblock: (timeblockId: string) => void;
  onDeleteTimeblockConfirm: (entry: CalendarEvent) => void;
  onViewStats: (entry: CalendarEvent) => void;
  onSkip: (entry: CalendarEvent) => void;
  onUnskip: (entry: CalendarEvent) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useCalendarCrudHandlers({
  selectedTimeblockId,
  filteredEvents,
  currentDate,
}: CalendarCrudHandlersInput): CalendarCrudHandlersResult {
  const timezone = useUserPreferences((preferences) => preferences.timezone);
  // =========================================================================
  // Calendar Handlers（click, create, drag-select）
  // =========================================================================
  const { handleTimeblockClick, handleDateTimeRangeSelect, disabledTimeblockId } =
    useCalendarHandlers();

  // =========================================================================
  // Timeblock Operations（CRUD）
  // =========================================================================
  const { handleTimeblockDelete: deleteTimeblock, handleUpdateTimeblock: handleTimeblockUpdate } =
    useTimeblockOperations();

  // =========================================================================
  // Context Actions（右クリックメニュー）
  // =========================================================================
  const {
    handleDeleteTimeblock: handleDeleteTimeblockConfirm,
    handleViewStats,
    handleSkip,
    handleUnskip,
  } = useTimeblockContextActions();

  // =========================================================================
  // Timeblock Keyboard Shortcuts
  // =========================================================================
  const getInitialEntryData = useCallback((): { start_time?: string; end_time?: string } => {
    const now = new Date();
    const start = startOfHour(now);
    const end = addHours(start, 1);
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };
  }, []);

  const getSelectedEntryTitle = useCallback(() => {
    if (!selectedTimeblockId) return null;
    const entry = filteredEvents.find((p) => p.id === selectedTimeblockId);
    return entry?.title ?? null;
  }, [selectedTimeblockId, filteredEvents]);

  const getSelectedEntryForCopy = useCallback(() => {
    if (!selectedTimeblockId) return null;
    const entry = filteredEvents.find((p) => p.id === selectedTimeblockId);
    if (!entry) return null;

    if (!entry.startDate || !entry.endDate) return null;

    return buildClipboardTimeblock(
      {
        title: entry.title,
        note: entry.description,
        tagId: entry.tagId,
        startAt: entry.startDate,
        endAt: entry.endDate,
      },
      timezone,
    );
  }, [selectedTimeblockId, filteredEvents, timezone]);

  const getPasteDateForKeyboard = useCallback(() => {
    return currentDate;
  }, [currentDate]);

  const deleteTimeblockAsync = useCallback(
    async (timeblockId: string) => {
      deleteTimeblock(timeblockId);
    },
    [deleteTimeblock],
  );

  useCalendarEventKeyboard({
    enabled: true,
    onDeleteTimeblock: deleteTimeblockAsync,
    getSelectedEntryTitle,
    getInitialEntryData,
    getSelectedEntryForCopy,
    getPasteDateForKeyboard,
  });

  // =========================================================================
  // Stable result
  // =========================================================================
  return useMemo(
    () => ({
      disabledTimeblockId,
      onEntryClick: handleTimeblockClick,
      onTimeRangeSelect: handleDateTimeRangeSelect,
      onUpdateEntry: handleTimeblockUpdate,
      onDeleteTimeblock: deleteTimeblock,
      onDeleteTimeblockConfirm: handleDeleteTimeblockConfirm,
      onViewStats: handleViewStats,
      onSkip: handleSkip,
      onUnskip: handleUnskip,
    }),
    [
      disabledTimeblockId,
      handleTimeblockClick,
      handleDateTimeRangeSelect,
      handleTimeblockUpdate,
      deleteTimeblock,
      handleDeleteTimeblockConfirm,
      handleViewStats,
      handleSkip,
      handleUnskip,
    ],
  );
}
