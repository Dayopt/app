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

import { CalendarTimeblockActionsProvider } from '../contexts/CalendarTimeblockActionsContext';
import { useCalendarKeyboard } from '../hooks/keyboard/useCalendarKeyboard';
import { useShortcutRegistry } from '../hooks/keyboard/useShortcutRegistry';
import { useCalendarContextMenu } from '../hooks/useCalendarContextMenu';
import { resolveCalendarDayDiffBounds, resolveCalendarRangeDiffBounds } from '../lib/day-diff';
import { computeTimeblockDayDiffs } from '../lib/timeblock-day-diff';
import { useCalendarFilterStore } from '../stores/useCalendarFilterStore';
import {
  isCalendarDiffView,
  type CalendarEvent,
  type CalendarViewType,
  type ViewDateRange,
} from '../types/calendar.types';

import { CalendarViewRenderer } from './controller/components';
import { initializePreload } from './controller/utils';

import type { UserSettings } from '@/features/calendar/stores/userSettings';
import { CalendarLayout } from './layout/CalendarLayout';
import { EventContextMenu, MobileTouchHint } from './views/shared/components';

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
  filteredTimeblocks: CalendarEvent[];
  allTimeblocks: CalendarEvent[];

  // --- Settings ---
  showWeekends: boolean;
  showActualDiff?: boolean;

  // --- Timeblock state ---
  disabledTimeblockId: string | null;

  // --- Timeblock click handlers ---
  onEntryClick: (entry: CalendarEvent) => void;
  onTimeRangeSelect: (selection: {
    date: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  }) => void;

  // --- Timeblock CRUD ---
  onUpdateEntry: (
    timeblockIdOrTimeblock: string | CalendarEvent,
    updates?: {
      startTime: Date;
      endTime: Date;
      resetActualTime?: boolean;
    },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
  onDeleteTimeblock: (timeblockId: string) => void;

  // --- Context menu actions ---
  onDeleteTimeblockConfirm: (entry: CalendarEvent) => void;
  onViewStats: (entry: CalendarEvent) => void;
  onCopy: (entry: CalendarEvent) => void;
  // plan ⇄ record 変換は time model に procedure が存在しないため optional（渡さなければメニュー非表示）
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
  recoverableSidebarWidth?: number | undefined;
  onSideRailSpaceRecoveryChange?: ((recovering: boolean) => void) | undefined;
}

interface CalendarCompareRailRenderProps {
  diff: ReturnType<typeof computeTimeblockDayDiffs>;
  variant: 'rail' | 'sheet';
  onItemClick: (timeblockId: string) => void;
  onClose?: (() => void) | undefined;
}

// =============================================================================
// Component
// =============================================================================

export function CalendarController({
  viewType,
  currentDate,
  viewDateRange,
  filteredTimeblocks,
  allTimeblocks,
  showWeekends,
  showActualDiff = false,
  disabledTimeblockId,
  onEntryClick,
  onTimeRangeSelect,
  onUpdateEntry,
  onDeleteTimeblock,
  onDeleteTimeblockConfirm,
  onViewStats,
  onCopy,
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
  recoverableSidebarWidth,
  onSideRailSpaceRecoveryChange,
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
  const calendarDiffDays = useMemo(
    () => (showWeekends ? viewDateRange.days : viewDateRange.days.filter((day) => !isWeekend(day))),
    [showWeekends, viewDateRange.days],
  );
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
  // Step 8: compare rail は plans/records（kind 付き CalendarEvent）から直接集計する。
  // タグ可視性・週末除外は集計対象から外すが、Plan は Record の関係解決用contextとして残す。
  // 連続範囲内の時間クリップは computeTimeblockDayDiffs 側の clippedMinutes に委ねる。
  const isWithinVisibleDayBounds = useCallback(
    (start: Date, end: Date) => {
      if (viewType === 'day' || showWeekends) return true;
      return calendarDiffDayBounds.some((bounds) => start < bounds.dayEnd && end > bounds.dayStart);
    },
    [calendarDiffDayBounds, showWeekends, viewType],
  );
  const calendarDiffPlans = useMemo(() => {
    void visibleTagIds;
    if (!calendarDiffEnabled) return [];
    return allTimeblocks
      .filter((entry) => entry.kind === 'plan')
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        tagId: entry.tagId ?? null,
        color: entry.color,
        startAt: entry.startDate ?? entry.displayStartDate,
        endAt: entry.endDate ?? entry.displayEndDate,
        skippedAt: entry.isSkipped ? (entry.startDate ?? entry.displayStartDate) : null,
        // 範囲外・非表示タグのPlanも、表示中Recordの関係解決には残す。
        isIncludedInDiff:
          isEntryVisible(entry.tagId ?? null) &&
          isWithinVisibleDayBounds(
            entry.startDate ?? entry.displayStartDate,
            entry.endDate ?? entry.displayEndDate,
          ),
      }));
  }, [allTimeblocks, calendarDiffEnabled, isEntryVisible, isWithinVisibleDayBounds, visibleTagIds]);
  const calendarDiffRecords = useMemo(() => {
    if (!calendarDiffEnabled) return [];
    return allTimeblocks
      .filter((entry) => entry.kind === 'record' && isEntryVisible(entry.tagId ?? null))
      .map((entry) => ({
        id: entry.id,
        planId: entry.planId ?? null,
        title: entry.title,
        tagId: entry.tagId ?? null,
        color: entry.color,
        startAt: entry.startDate ?? entry.displayStartDate,
        endAt: entry.endDate ?? entry.displayEndDate,
      }))
      .filter((record) => isWithinVisibleDayBounds(record.startAt, record.endAt));
  }, [allTimeblocks, calendarDiffEnabled, isEntryVisible, isWithinVisibleDayBounds]);
  const calendarDiff = useMemo(
    () => computeTimeblockDayDiffs(calendarDiffPlans, calendarDiffRecords, calendarDiffBounds),
    [calendarDiffBounds, calendarDiffPlans, calendarDiffRecords],
  );
  const dayDiffEntryIds = useMemo(
    () => new Set(calendarDiff.items.map((item) => item.timeblockId)),
    [calendarDiff.items],
  );
  const handleCalendarDiffItemClick = useCallback(
    (timeblockId: string) => {
      const entry = allTimeblocks.find((candidate) => candidate.id === timeblockId);
      if (entry) onEntryClick(entry);
    },
    [allTimeblocks, onEntryClick],
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
  const timeblockActions = useMemo(
    () => ({
      onEntryClick,
      onEntryContextMenu: handleEventContextMenu,
      onUpdateEntry,
      onDeleteTimeblock,
      onTimeRangeSelect,
      disabledTimeblockId,
    }),
    [
      onEntryClick,
      handleEventContextMenu,
      onUpdateEntry,
      onDeleteTimeblock,
      onTimeRangeSelect,
      disabledTimeblockId,
    ],
  );

  // View props（データ + ナビゲーションのみ。エントリ操作はContext経由）
  const commonProps = useMemo(
    () => ({
      dateRange: viewDateRange,
      entries: filteredTimeblocks,
      allTimeblocks,
      currentDate,
      showWeekends,
      showActualDiff,
      dayDiffEntryIds,
      disabledTimeblockId,
      onEntryClick,
      onEntryContextMenu: handleEventContextMenu,
      onUpdateEntry,
      onDeleteTimeblock,
      onTimeRangeSelect,
      onViewChange,
      onNavigatePrev,
      onNavigateNext,
      onNavigateToday,
    }),
    [
      viewDateRange,
      filteredTimeblocks,
      allTimeblocks,
      currentDate,
      showWeekends,
      showActualDiff,
      dayDiffEntryIds,
      disabledTimeblockId,
      onEntryClick,
      handleEventContextMenu,
      onUpdateEntry,
      onDeleteTimeblock,
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
    <CalendarTimeblockActionsProvider value={timeblockActions}>
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
        recoverableSidebarWidth={recoverableSidebarWidth}
        onSideRailSpaceRecoveryChange={onSideRailSpaceRecoveryChange}
      >
        <CalendarViewRenderer viewType={viewType} commonProps={commonProps} />
      </CalendarLayout>

      {contextMenuEvent && contextMenuPosition ? (
        <EventContextMenu
          entry={contextMenuEvent}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onDelete={onDeleteTimeblockConfirm}
          onViewStats={onViewStats}
          onCopy={onCopy}
          onMarkUnplanned={onMarkUnplanned}
          onRestorePlanned={onRestorePlanned}
          onSkip={onSkip}
          onUnskip={onUnskip}
        />
      ) : null}

      {/* モバイル操作ヒント（初回のみ表示） */}
      <MobileTouchHint />
    </CalendarTimeblockActionsProvider>
  );
}
