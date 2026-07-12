'use client';

/**
 * Calendar CRUD Handlers Hook
 *
 * Entry のクリック・作成・更新・削除・コンテキストメニュー操作を担当。
 * キーボードショートカット（Entry操作系）もここに集約。
 */

import { useCallback, useMemo } from 'react';

import { addHours, startOfHour } from 'date-fns';

import type { CalendarEvent } from '@/features/calendar';
import {
  useCalendarEventKeyboard,
  useCalendarHandlers,
  useTimeblockContextActions,
  useTimeblockOperations,
} from '@/features/calendar';

// =============================================================================
// Types
// =============================================================================

interface CalendarCrudHandlersInput {
  /** Inspector で選択中の Entry ID */
  selectedEntryId: string | null;
  /** フィルタ済みイベント一覧（キーボード操作でタイトル取得に使用） */
  filteredEvents: CalendarEvent[];
  /** 現在の表示日付（キーボード操作で過去日判定に使用） */
  currentDate: Date;
}

interface CalendarCrudHandlersResult {
  disabledEntryId: string | null;
  onEntryClick: (entry: CalendarEvent) => void;
  onTimeRangeSelect: (selection: {
    date: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }) => void;
  onUpdateEntry: (
    entryIdOrEntry: string | CalendarEvent,
    updates?: { startTime: Date; endTime: Date; resetActualTime?: boolean },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeleteEntry: (entryId: string) => void;
  onDeleteEntryConfirm: (entry: CalendarEvent) => void;
  onViewStats: (entry: CalendarEvent) => void;
  onSkip: (entry: CalendarEvent) => void;
  onUnskip: (entry: CalendarEvent) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useCalendarCrudHandlers({
  selectedEntryId,
  filteredEvents,
  currentDate,
}: CalendarCrudHandlersInput): CalendarCrudHandlersResult {
  // =========================================================================
  // Calendar Handlers（click, create, drag-select）
  // =========================================================================
  const { handleEntryClick, handleDateTimeRangeSelect, disabledEntryId } = useCalendarHandlers();

  // =========================================================================
  // Entry Operations（CRUD）
  // =========================================================================
  const { handleEntryDelete: deleteEntry, handleUpdateEntry: handleEntryUpdate } =
    useTimeblockOperations();

  // =========================================================================
  // Context Actions（右クリックメニュー）
  // =========================================================================
  const {
    handleDeleteEntry: handleDeleteEntryConfirm,
    handleViewStats,
    handleSkip,
    handleUnskip,
  } = useTimeblockContextActions();

  // =========================================================================
  // Entry Keyboard Shortcuts
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
    if (!selectedEntryId) return null;
    const entry = filteredEvents.find((p) => p.id === selectedEntryId);
    return entry?.title ?? null;
  }, [selectedEntryId, filteredEvents]);

  const getSelectedEntryForCopy = useCallback(() => {
    if (!selectedEntryId) return null;
    const entry = filteredEvents.find((p) => p.id === selectedEntryId);
    if (!entry) return null;

    const startHour = entry.startDate?.getHours() ?? 0;
    const startMinute = entry.startDate?.getMinutes() ?? 0;
    const duration =
      entry.endDate && entry.startDate
        ? (entry.endDate.getTime() - entry.startDate.getTime()) / 60000
        : 60;

    return {
      title: entry.title,
      description: entry.description ?? null,
      startHour,
      startMinute,
      duration,
      tagId: entry.tagId,
    };
  }, [selectedEntryId, filteredEvents]);

  const getPasteDateForKeyboard = useCallback(() => {
    return currentDate;
  }, [currentDate]);

  const deleteEntryAsync = useCallback(
    async (entryId: string) => {
      deleteEntry(entryId);
    },
    [deleteEntry],
  );

  useCalendarEventKeyboard({
    enabled: true,
    onDeleteEntry: deleteEntryAsync,
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
      disabledEntryId,
      onEntryClick: handleEntryClick,
      onTimeRangeSelect: handleDateTimeRangeSelect,
      onUpdateEntry: handleEntryUpdate,
      onDeleteEntry: deleteEntry,
      onDeleteEntryConfirm: handleDeleteEntryConfirm,
      onViewStats: handleViewStats,
      onSkip: handleSkip,
      onUnskip: handleUnskip,
    }),
    [
      disabledEntryId,
      handleEntryClick,
      handleDateTimeRangeSelect,
      handleEntryUpdate,
      deleteEntry,
      handleDeleteEntryConfirm,
      handleViewStats,
      handleSkip,
      handleUnskip,
    ],
  );
}
