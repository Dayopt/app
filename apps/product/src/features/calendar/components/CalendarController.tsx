'use client';

/**
 * CalendarController - Calendar View Shell
 *
 * composition layerからprops経由でデータ・コールバックを受け取り、
 * キーボードショートカット・コンテキストメニュー・DnDを設定してUIをレンダリングする。
 *
 * @see _composition/useCalendarComposition.ts
 */

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import { isWeekend } from 'date-fns';

import { useUserPreferences } from '@/lib/hooks/useUserPreferences';

import { CalendarEntryActionsProvider } from '../contexts/CalendarEntryActionsContext';
import { useCalendarKeyboard } from '../hooks/keyboard/useCalendarKeyboard';
import { useShortcutRegistry } from '../hooks/keyboard/useShortcutRegistry';
import { useCalendarContextMenu } from '../hooks/useCalendarContextMenu';
import {
  computeCalendarDayDiffs,
  filterCalendarDayDiffEntries,
  resolveCalendarDayDiffBounds,
  resolveCalendarRangeDiffBounds,
} from '../lib/day-diff';
import { useCalendarFilterStore } from '../stores/useCalendarFilterStore';
import {
  getMultiDayCount,
  isCalendarDiffView,
  isMultiDayView,
  type CalendarEvent,
  type CalendarViewType,
  type ViewDateRange,
} from '../types/calendar.types';

import { CalendarViewRenderer } from './controller/components';
import { initializePreload } from './controller/utils';

import type { UserSettings } from '@/features/calendar/stores/userSettings';
import { CalendarLayout } from './layout/CalendarLayout';
import { EventContextMenu, MobileTouchHint } from './views/shared/components';
import { generateMultiDayDates } from './views/shared/hooks/useDateUtilities';

// 初回ロード時にビューをプリロード
initializePreload();

// =============================================================================
// Props
// =============================================================================

/** CalendarController コンポーネントのプロパティ */
interface CalendarControllerProps {
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
  showActualDiff?: boolean;

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
    updates?: {
      startTime: Date;
      endTime: Date;
      resetActualTime?: boolean;
    },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeleteEntry: (entryId: string) => void;

  // --- Context menu actions ---
  onDeleteEntryConfirm: (entry: CalendarEvent) => void;
  onViewStats: (entry: CalendarEvent) => void;
  // plan ⇄ log 変換は time model に procedure が存在しないため optional（渡さなければメニュー非表示）
  onMarkUnplanned?: ((entry: CalendarEvent) => void) | undefined;
  onRestorePlanned?: ((entry: CalendarEvent) => void) | undefined;
  onSkip: (entry: CalendarEvent) => void;
  onUnskip: (entry: CalendarEvent) => void;

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
  onSettingsChange?: (settings: Partial<UserSettings>) => void;

  // --- Slots ---
  className?: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  onCompareRailOpenChange?: ((open: boolean) => void) | undefined;
  renderCompareRail?: ((props: CalendarCompareRailRenderProps) => React.ReactNode) | undefined;
  panelRail?: React.ReactNode | undefined;
  mobilePanelRail?: React.ReactNode | undefined;
  panelRailOpen?: boolean | undefined;
  onPanelRailOpenChange?: ((open: boolean) => void) | undefined;
  panelRailTitle?: string | undefined;
  panelRailDescription?: string | undefined;
  sideRailRecoverableWidth?: number | undefined;
  onSideRailRecoverableWidthRequest?: (() => void) | undefined;
}

interface CalendarCompareRailRenderProps {
  diff: ReturnType<typeof computeCalendarDayDiffs>;
  variant: 'rail' | 'sheet';
  onItemClick: (entryId: string) => void;
  onClose?: (() => void) | undefined;
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
  showActualDiff = false,
  disabledEntryId,
  onEntryClick,
  onTimeRangeSelect,
  onUpdateEntry,
  onDeleteEntry,
  onDeleteEntryConfirm,
  onViewStats,
  onMarkUnplanned,
  onRestorePlanned,
  onSkip,
  onUnskip,
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
  onCompareRailOpenChange,
  renderCompareRail,
  panelRail,
  mobilePanelRail,
  panelRailOpen = false,
  onPanelRailOpenChange,
  panelRailTitle,
  panelRailDescription,
  sideRailRecoverableWidth,
  onSideRailRecoverableWidthRequest,
}: CalendarControllerProps) {
  const t = useTranslations();

  // =========================================================================
  // Calendar-internal hooks
  // =========================================================================

  // ショートカットレジストリのグローバルリスナー（1箇所のみ呼び出し）
  useShortcutRegistry();
  const timezone = useUserPreferences((preferences) => preferences.timezone);
  const isEntryVisible = useCalendarFilterStore((state) => state.isEntryVisible);
  const visibleTagIds = useCalendarFilterStore((state) => state.visibleTagIds);

  // コンテキストメニュー管理
  const { contextMenuEvent, contextMenuPosition, handleEventContextMenu, handleCloseContextMenu } =
    useCalendarContextMenu();
  const calendarDiffDays = useMemo(() => {
    if (isMultiDayView(viewType)) {
      return generateMultiDayDates(currentDate, getMultiDayCount(viewType), showWeekends);
    }
    if (viewType === 'day' || showWeekends) return viewDateRange.days;
    return viewDateRange.days.filter((day) => !isWeekend(day));
  }, [currentDate, showWeekends, viewDateRange.days, viewType]);
  const calendarDiffEnabled =
    showActualDiff &&
    isCalendarDiffView(viewType) &&
    (viewType === 'day' || calendarDiffDays.length > 0);
  const calendarDiffDayBounds = useMemo(
    () => calendarDiffDays.map((day) => resolveCalendarDayDiffBounds(day, timezone)),
    [calendarDiffDays, timezone],
  );
  const calendarDiffBounds = useMemo(
    () =>
      viewType === 'day' || calendarDiffDays.length === 0
        ? resolveCalendarDayDiffBounds(currentDate, timezone)
        : resolveCalendarRangeDiffBounds(
            calendarDiffDays[0] ?? viewDateRange.start,
            calendarDiffDays[calendarDiffDays.length - 1] ?? viewDateRange.end,
            timezone,
          ),
    [calendarDiffDays, currentDate, timezone, viewDateRange.end, viewDateRange.start, viewType],
  );
  const calendarDiffEntries = useMemo(() => {
    void visibleTagIds;
    if (!calendarDiffEnabled) return [];

    const boundedEntries = filterCalendarDayDiffEntries(
      allEntries,
      calendarDiffBounds,
      isEntryVisible,
    );
    if (viewType === 'day' || showWeekends) return boundedEntries;

    const visibleEntryIds = new Set<string>();
    for (const bounds of calendarDiffDayBounds) {
      for (const entry of filterCalendarDayDiffEntries(boundedEntries, bounds, isEntryVisible)) {
        visibleEntryIds.add(entry.id);
      }
    }
    return boundedEntries.filter((entry) => visibleEntryIds.has(entry.id));
  }, [
    allEntries,
    calendarDiffBounds,
    calendarDiffDayBounds,
    calendarDiffEnabled,
    isEntryVisible,
    showWeekends,
    viewType,
    visibleTagIds,
  ]);
  const calendarDiff = useMemo(
    () =>
      calendarDiffEnabled
        ? computeCalendarDayDiffs(calendarDiffEntries, calendarDiffBounds)
        : computeCalendarDayDiffs([]),
    [calendarDiffBounds, calendarDiffEnabled, calendarDiffEntries],
  );
  const dayDiffEntryIds = calendarDiff.entryIds;
  const calendarDiffEntryById = useMemo(
    () => new Map(calendarDiffEntries.map((entry) => [entry.id, entry])),
    [calendarDiffEntries],
  );
  const handleCalendarDiffItemClick = useCallback(
    (entryId: string) => {
      const entry = calendarDiffEntryById.get(entryId);
      if (entry) onEntryClick(entry);
    },
    [calendarDiffEntryById, onEntryClick],
  );
  const handleCloseCompareRail = useCallback(() => {
    onCompareRailOpenChange?.(false);
  }, [onCompareRailOpenChange]);

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
      showActualDiff,
      dayDiffEntryIds,
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
      showActualDiff,
      dayDiffEntryIds,
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

  const compareRail =
    calendarDiffEnabled && renderCompareRail
      ? renderCompareRail({
          diff: calendarDiff,
          variant: 'rail',
          onItemClick: handleCalendarDiffItemClick,
          onClose: onCompareRailOpenChange ? handleCloseCompareRail : undefined,
        })
      : null;
  const mobileCompareRail =
    calendarDiffEnabled && renderCompareRail
      ? renderCompareRail({
          diff: calendarDiff,
          variant: 'sheet',
          onItemClick: handleCalendarDiffItemClick,
          onClose: onCompareRailOpenChange ? handleCloseCompareRail : undefined,
        })
      : null;
  const compareRailOpen = Boolean(compareRail);
  const panelRailActive = Boolean(panelRailOpen && panelRail);
  const activeRail = panelRailActive ? panelRail : compareRail;
  const activeMobileRail = panelRailActive ? (mobilePanelRail ?? panelRail) : mobileCompareRail;
  const activeRailOpen = panelRailActive || compareRailOpen;
  const activeRailTitle = panelRailActive
    ? (panelRailTitle ?? t('calendar.analysis.panel.title'))
    : t('calendar.compare.rail.title');
  const activeRailDescription = panelRailActive
    ? (panelRailDescription ?? t('calendar.analysis.panel.description'))
    : t('calendar.compare.rail.description');
  const handleSideRailOpenChange = useCallback(
    (open: boolean) => {
      if (panelRailActive) {
        onPanelRailOpenChange?.(open);
        return;
      }

      onCompareRailOpenChange?.(open);
    },
    [panelRailActive, onPanelRailOpenChange, onCompareRailOpenChange],
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
        sideRail={activeRail}
        mobileSideRail={activeMobileRail}
        mobileSideRailPresentation="sheet"
        sideRailOpen={activeRailOpen}
        onSideRailOpenChange={handleSideRailOpenChange}
        sideRailTitle={activeRailTitle}
        sideRailDescription={activeRailDescription}
        sideRailResizeLabel={t('calendar.panel.resizeLabel')}
        sideRailRecoverableWidth={sideRailRecoverableWidth}
        onSideRailRecoverableWidthRequest={onSideRailRecoverableWidthRequest}
      >
        <CalendarViewRenderer viewType={viewType} commonProps={commonProps} />
      </CalendarLayout>

      {contextMenuEvent && contextMenuPosition ? (
        <EventContextMenu
          entry={contextMenuEvent}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onDelete={onDeleteEntryConfirm}
          onViewStats={onViewStats}
          onMarkUnplanned={onMarkUnplanned}
          onRestorePlanned={onRestorePlanned}
          onSkip={onSkip}
          onUnskip={onUnskip}
        />
      ) : null}

      {/* モバイル操作ヒント（初回のみ表示） */}
      <MobileTouchHint />
    </CalendarEntryActionsProvider>
  );
}
