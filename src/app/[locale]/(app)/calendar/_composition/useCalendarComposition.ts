'use client';

/**
 * Calendar Composition Hook
 *
 * CalendarControllerに必要な全データ・コールバックを集約する。
 * feature間の橋渡しはこのhookのみが行い、CalendarControllerは純粋なViewとなる。
 *
 * @see /docs/architecture/grand-design.md
 */

import React, { useCallback, useEffect, useMemo } from 'react';

import { addHours, startOfHour } from 'date-fns';

// Feature barrel imports（cross-feature依存はここに集約）
import type { CalendarEvent, CalendarViewType, ViewDateRange } from '@/features/calendar';
import {
  useCalendarData,
  useCalendarEventKeyboard,
  useCalendarHandlers,
  useCalendarNavigationHandlers,
  usePlanContextActions,
  usePlanOperations,
  useWeekendToggleShortcut,
} from '@/features/calendar';
import { useEntryInspectorStore } from '@/features/entry';
import { useNotifications } from '@/features/notifications';
import { usePaletteItems, usePaletteMutations } from '@/features/palette';
import { useCalendarNavigationStore } from '@/stores/useCalendarNavigationStore';

import { getCurrentTimezone, setUserTimezone, useUserSettings } from '@/features/settings';
import { logger } from '@/lib/logger';
import type { CalendarSettings } from '@/stores/useCalendarSettingsStore';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export interface CalendarCompositionInput {
  /** 現在のビュータイプ */
  viewType: CalendarViewType;
  /** 現在の表示日付 */
  currentDate: Date;
  /** 相対ナビゲーション */
  navigateRelative: (direction: 'prev' | 'next' | 'today') => void;
  /** 日付指定ナビゲーション */
  navigateToDate: (date: Date) => void;
  /** ビュー変更 */
  changeView: (view: CalendarViewType) => void;
}

export interface CalendarCompositionResult {
  // === Data ===
  viewDateRange: ViewDateRange;
  filteredEvents: CalendarEvent[];
  allCalendarEvents: CalendarEvent[];

  // === Settings ===
  showWeekends: boolean;

  // === Plan state ===
  disabledPlanId: string | null;

  // === Plan click handlers ===
  onPlanClick: (plan: CalendarEvent) => void;
  onTimeRangeSelect: (selection: {
    date: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }) => void;

  // === Plan CRUD ===
  onUpdatePlan: (
    planIdOrPlan: string | CalendarEvent,
    updates?: { startTime: Date; endTime: Date },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeletePlan: (planId: string) => void;

  // === Context menu actions ===
  getAddToPaletteHandler: (plan: CalendarEvent) => ((plan: CalendarEvent) => void) | undefined;
  onDeletePlanConfirm: (plan: CalendarEvent) => void;

  // === Navigation handlers ===
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (newView: CalendarViewType) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
  onToggleWeekends: () => void;
  onDateSelect: (date: Date) => void;

  // === Settings persistence ===
  onSettingsChange: (settings: Partial<CalendarSettings>) => void;
}

// =============================================================================
// Composition Hook
// =============================================================================

export function useCalendarComposition({
  viewType,
  currentDate,
  navigateRelative,
  navigateToDate,
  changeView,
}: CalendarCompositionInput): CalendarCompositionResult {
  // =========================================================================
  // i18n
  // =========================================================================
  const tError = useTranslations('calendar.error');

  // =========================================================================
  // Settings
  // =========================================================================
  const timezone = useCalendarSettingsStore((state) => state.timezone);
  const showWeekends = useCalendarSettingsStore((s) => s.showWeekends);
  const updateSettings = useCalendarSettingsStore((state) => state.updateSettings);
  const { saveSettings } = useUserSettings();

  // タイムゾーン設定の初期化（マウント時のみ）
  useEffect(() => {
    setUserTimezone(timezone);
    if (timezone === 'Asia/Tokyo') {
      const actualTimezone = getCurrentTimezone();
      if (actualTimezone !== 'Asia/Tokyo') {
        updateSettings({ timezone: actualTimezone });
      }
    }
  }, [timezone, updateSettings]);

  // =========================================================================
  // Plan Inspector state
  // =========================================================================
  const selectedPlanId = useEntryInspectorStore((state) => state.entryId);
  const closeInspector = useEntryInspectorStore((state) => state.closeInspector);

  // 日付ナビゲーション時にInspectorを閉じる（staleなエントリ表示を防止）
  const prevDateRef = React.useRef(currentDate);
  useEffect(() => {
    if (prevDateRef.current !== currentDate) {
      prevDateRef.current = currentDate;
      closeInspector();
    }
  }, [currentDate, closeInspector]);

  // =========================================================================
  // Notifications（初回許可リクエスト）
  // =========================================================================
  const {
    permission: notificationPermission,
    hasRequested: hasRequestedNotification,
    requestPermission: requestNotificationPermission,
  } = useNotifications();

  useEffect(() => {
    if (!hasRequestedNotification && (notificationPermission as string) === 'default') {
      requestNotificationPermission();
    }
  }, [hasRequestedNotification, notificationPermission, requestNotificationPermission]);

  // =========================================================================
  // Data Layer（plans + records + filtering）
  // =========================================================================
  const { viewDateRange, filteredEvents, allCalendarEvents, entriesError } = useCalendarData({
    viewType,
    currentDate,
  });

  // エントリ取得エラー時にtoast通知
  useEffect(() => {
    if (entriesError) {
      logger.error('[useCalendarComposition] entries fetch error', entriesError);
      toast.error(tError('entriesLoadFailed'));
    }
  }, [entriesError, tError]);

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
      // タグなし or duration なし → パレット追加不可
      if (!plan.tagId || !plan.duration) return undefined;
      // 既にパレットに登録済み → 非表示
      const isPinned = paletteItems?.some(
        (item) => item.tag_id === plan.tagId && item.duration_minutes === plan.duration,
      );
      if (isPinned) return undefined;
      return handleAddToPalette;
    },
    [paletteItems, handleAddToPalette],
  );

  // =========================================================================
  // Navigation Handlers
  // =========================================================================
  const {
    handleNavigate,
    handleViewChange,
    handleNavigatePrev,
    handleNavigateNext,
    handleNavigateToday,
    handleToggleWeekends,
    handleDateSelect,
  } = useCalendarNavigationHandlers({
    viewType,
    currentDate,
    showWeekends,
    navigateRelative,
    navigateToDate,
    changeView,
  });

  // =========================================================================
  // Settings persistence（ViewSwitcherからの設定変更をDBに保存）
  // =========================================================================
  const handleSettingsChange = useCallback(
    (settings: Partial<CalendarSettings>) => {
      // storeは既に更新済み（ViewSwitcher側）なのでDB保存のみ
      saveSettings(settings);
    },
    [saveSettings],
  );

  // =========================================================================
  // External Navigation（検索等からの日付ナビゲーション要求を処理）
  // =========================================================================
  const pendingDate = useCalendarNavigationStore((s) => s.pendingDate);
  const clearPending = useCalendarNavigationStore((s) => s.clearPending);

  useEffect(() => {
    if (pendingDate) {
      navigateToDate(pendingDate);
      clearPending();
    }
  }, [pendingDate, navigateToDate, clearPending]);

  // =========================================================================
  // Weekend Toggle Shortcut
  // =========================================================================
  useWeekendToggleShortcut(handleSettingsChange);

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
  // Debug logging（初回マウント時のみ）
  // =========================================================================
  useEffect(() => {
    logger.log('📊 CalendarComposition initialized:', { viewType });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ
  }, []);

  // =========================================================================
  // Return composition result（useMemoでContext value安定化）
  // =========================================================================
  return useMemo(
    () => ({
      // Data
      viewDateRange,
      filteredEvents,
      allCalendarEvents,

      // Settings
      showWeekends,

      // Plan state
      disabledPlanId,

      // Plan click handlers
      onPlanClick: handlePlanClick,
      onTimeRangeSelect: handleDateTimeRangeSelect,

      // Plan CRUD
      onUpdatePlan: handlePlanUpdate,
      onDeletePlan: deletePlan,

      // Context menu actions
      getAddToPaletteHandler,
      onDeletePlanConfirm: handleDeletePlanConfirm,

      // Navigation handlers
      onNavigate: handleNavigate,
      onViewChange: handleViewChange,
      onNavigatePrev: handleNavigatePrev,
      onNavigateNext: handleNavigateNext,
      onNavigateToday: handleNavigateToday,
      onToggleWeekends: handleToggleWeekends,
      onDateSelect: handleDateSelect,
      onSettingsChange: handleSettingsChange,
    }),
    [
      viewDateRange,
      filteredEvents,
      allCalendarEvents,
      showWeekends,
      disabledPlanId,
      handlePlanClick,
      handleDateTimeRangeSelect,
      handlePlanUpdate,
      deletePlan,
      getAddToPaletteHandler,
      handleDeletePlanConfirm,
      handleNavigate,
      handleViewChange,
      handleNavigatePrev,
      handleNavigateNext,
      handleNavigateToday,
      handleToggleWeekends,
      handleDateSelect,
      handleSettingsChange,
    ],
  );
}
