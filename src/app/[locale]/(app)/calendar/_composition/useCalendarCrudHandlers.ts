'use client';

/**
 * Calendar CRUD Handlers Hook
 *
 * Plan のクリック・作成・更新・削除・コンテキストメニュー操作を担当。
 * キーボードショートカット（Plan操作系）もここに集約。
 */

import { useCallback, useMemo } from 'react';

import { addHours, startOfHour } from 'date-fns';

import type { CalendarEvent } from '@/features/calendar';
import {
  useCalendarEventKeyboard,
  useCalendarHandlers,
  usePlanContextActions,
  usePlanOperations,
} from '@/features/calendar';
import { usePaletteItems, usePaletteMutations } from '@/features/palette';

// =============================================================================
// Types
// =============================================================================

export interface CalendarCrudHandlersInput {
  /** Inspector で選択中の Plan ID */
  selectedPlanId: string | null;
  /** フィルタ済みイベント一覧（キーボード操作でタイトル取得に使用） */
  filteredEvents: CalendarEvent[];
  /** 現在の表示日付（キーボード操作で過去日判定に使用） */
  currentDate: Date;
}

export interface CalendarCrudHandlersResult {
  disabledPlanId: string | null;
  onPlanClick: (plan: CalendarEvent) => void;
  onTimeRangeSelect: (selection: {
    date: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }) => void;
  onUpdatePlan: (
    planIdOrPlan: string | CalendarEvent,
    updates?: { startTime: Date; endTime: Date },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeletePlan: (planId: string) => void;
  getAddToPaletteHandler: (plan: CalendarEvent) => ((plan: CalendarEvent) => void) | undefined;
  onDeletePlanConfirm: (plan: CalendarEvent) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useCalendarCrudHandlers({
  selectedPlanId,
  filteredEvents,
  currentDate,
}: CalendarCrudHandlersInput): CalendarCrudHandlersResult {
  // =========================================================================
  // Calendar Handlers（click, create, drag-select）
  // =========================================================================
  const { handlePlanClick, handleDateTimeRangeSelect, disabledPlanId } = useCalendarHandlers();

  // =========================================================================
  // Plan Operations（CRUD）
  // =========================================================================
  const { handlePlanDelete: deletePlan, handleUpdatePlan: handlePlanUpdate } = usePlanOperations();

  // =========================================================================
  // Context Actions（右クリックメニュー）
  // =========================================================================
  const { handleDeletePlan: handleDeletePlanConfirm } = usePlanContextActions();

  // =========================================================================
  // Palette Pin（コンテキストメニューから「パレットに追加」）
  // =========================================================================
  const { data: paletteItems } = usePaletteItems();
  const { pinItem } = usePaletteMutations();

  const handleAddToPalette = useCallback(
    (plan: CalendarEvent) => {
      if (!plan.tagId || !plan.duration) return;
      pinItem(plan.tagId, plan.duration);
    },
    [pinItem],
  );

  /** エントリのtag+durationがパレットに登録済みかを判定し、未登録時のみコールバックを返す */
  const getAddToPaletteHandler = useCallback(
    (plan: CalendarEvent) => {
      if (!plan.tagId || !plan.duration) return undefined;
      const isPinned = paletteItems?.some(
        (item) => item.tag_id === plan.tagId && item.duration_minutes === plan.duration,
      );
      if (isPinned) return undefined;
      return handleAddToPalette;
    },
    [paletteItems, handleAddToPalette],
  );

  // =========================================================================
  // Plan Keyboard Shortcuts
  // =========================================================================
  const getInitialPlanData = useCallback((): { start_time?: string; end_time?: string } => {
    const now = new Date();
    const start = startOfHour(now);
    const end = addHours(start, 1);
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };
  }, []);

  const getSelectedPlanTitle = useCallback(() => {
    if (!selectedPlanId) return null;
    const plan = filteredEvents.find((p) => p.id === selectedPlanId);
    return plan?.title ?? null;
  }, [selectedPlanId, filteredEvents]);

  const getSelectedPlanForCopy = useCallback(() => {
    if (!selectedPlanId) return null;
    const plan = filteredEvents.find((p) => p.id === selectedPlanId);
    if (!plan) return null;

    const startHour = plan.startDate?.getHours() ?? 0;
    const startMinute = plan.startDate?.getMinutes() ?? 0;
    const duration =
      plan.endDate && plan.startDate
        ? (plan.endDate.getTime() - plan.startDate.getTime()) / 60000
        : 60;

    return {
      title: plan.title,
      description: plan.description ?? null,
      startHour,
      startMinute,
      duration,
      tagId: plan.tagId,
    };
  }, [selectedPlanId, filteredEvents]);

  const getPasteDateForKeyboard = useCallback(() => {
    return currentDate;
  }, [currentDate]);

  const deletePlanAsync = useCallback(
    async (planId: string) => {
      deletePlan(planId);
    },
    [deletePlan],
  );

  useCalendarEventKeyboard({
    enabled: true,
    onDeletePlan: deletePlanAsync,
    getSelectedPlanTitle,
    getInitialPlanData,
    getSelectedPlanForCopy,
    getPasteDateForKeyboard,
  });

  // =========================================================================
  // Stable result
  // =========================================================================
  return useMemo(
    () => ({
      disabledPlanId,
      onPlanClick: handlePlanClick,
      onTimeRangeSelect: handleDateTimeRangeSelect,
      onUpdatePlan: handlePlanUpdate,
      onDeletePlan: deletePlan,
      getAddToPaletteHandler,
      onDeletePlanConfirm: handleDeletePlanConfirm,
    }),
    [
      disabledPlanId,
      handlePlanClick,
      handleDateTimeRangeSelect,
      handlePlanUpdate,
      deletePlan,
      getAddToPaletteHandler,
      handleDeletePlanConfirm,
    ],
  );
}
