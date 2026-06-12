'use client';

/**
 * Calendar Navigation Handlers Hook
 *
 * ナビゲーション系コールバック + 設定永続化を担当。
 * useCalendarNavigationHandlers をラップし、設定保存コールバックを追加。
 */

import { useCallback, useMemo } from 'react';

import type { CalendarViewType, UserSettings } from '@/features/calendar';
import {
  useCalendarNavigationHandlers,
  useCalendarSettingsStore,
  useWeekendToggleShortcut,
} from '@/features/calendar';
import { useUserSettings } from '@/features/settings';

// =============================================================================
// Types
// =============================================================================

interface CalendarNavHandlersInput {
  viewType: CalendarViewType;
  currentDate: Date;
  navigateRelative: (direction: 'prev' | 'next' | 'today') => void;
  navigateToDate: (date: Date) => void;
  changeView: (view: CalendarViewType) => void;
}

interface CalendarNavHandlersResult {
  showWeekends: boolean;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (newView: CalendarViewType) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
  onToggleWeekends: () => void;
  onDateSelect: (date: Date) => void;
  onSettingsChange: (settings: Partial<UserSettings>) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useCalendarNavHandlers({
  viewType,
  currentDate,
  navigateRelative,
  navigateToDate,
  changeView,
}: CalendarNavHandlersInput): CalendarNavHandlersResult {
  const showWeekends = useCalendarSettingsStore((s) => s.showWeekends);
  const { saveSettings } = useUserSettings();

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

  // Settings persistence（ViewSwitcherからの設定変更をDBに保存）
  const handleSettingsChange = useCallback(
    (settings: Partial<UserSettings>) => {
      saveSettings(settings);
    },
    [saveSettings],
  );

  // Weekend Toggle Shortcut
  useWeekendToggleShortcut(handleSettingsChange);

  return useMemo(
    () => ({
      showWeekends,
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
      showWeekends,
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
