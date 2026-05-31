'use client';

import React, { useCallback, useState } from 'react';

import { isSameDay } from 'date-fns';
import { useTranslations } from 'next-intl';

import { EntryCard } from '@/features/entry';
import { useTagsMap } from '@/features/tags';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { ConfirmDialog } from '@/lib/components/ui/confirm-dialog';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

import { useInteraction } from '../../../../interaction';
import { GhostRenderer } from '../../../../interaction/GhostRenderer';
import { useCalendarDragStore } from '../../../../stores/useCalendarDragStore';
import { useTagDraftStore } from '../../../../stores/useTagDraftStore';
import type { CalendarEvent } from '../../../../types/calendar.types';
import { useResponsiveHourHeight } from '../hooks/useResponsiveHourHeight';
import type { DateTimeSelection } from './CalendarDragSelection';
import { CalendarDragSelection } from './CalendarDragSelection';
import { DraftEntryBlock } from './DraftEntryBlock';
import { EntryRenderer } from './EntryRenderer';
import { InlineTagPalette } from './InlineTagPalette';

// ========================================
// Types
// ========================================

function rangeDiffers(
  firstStart: Date | null | undefined,
  firstEnd: Date | null | undefined,
  secondStart: Date | null | undefined,
  secondEnd: Date | null | undefined,
): boolean {
  if (!firstStart || !firstEnd || !secondStart || !secondEnd) return false;
  return (
    firstStart.getTime() !== secondStart.getTime() || firstEnd.getTime() !== secondEnd.getTime()
  );
}

function actualDiffersFromPlanned(entry: CalendarEvent): boolean {
  if (entry.origin !== 'planned') return false;
  const plannedStart = entry.plannedStartDate ?? entry.startDate;
  const plannedEnd = entry.plannedEndDate ?? entry.endDate;
  return rangeDiffers(plannedStart, plannedEnd, entry.actualStartDate, entry.actualEndDate);
}

function minutesToSelection(
  date: Date,
  startMinutes: number,
  endMinutes: number,
): DateTimeSelection {
  const normalizedStart = Math.max(0, Math.min(startMinutes, 24 * 60 - 1));
  const normalizedEnd = Math.max(normalizedStart + 1, Math.min(endMinutes, 24 * 60 - 1));
  return {
    date,
    startHour: Math.floor(normalizedStart / 60),
    startMinute: normalizedStart % 60,
    endHour: Math.floor(normalizedEnd / 60),
    endMinute: normalizedEnd % 60,
  };
}

function minutesToDate(date: Date, minutes: number): Date {
  const normalizedMinutes = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const result = new Date(date);
  result.setHours(Math.floor(normalizedMinutes / 60), normalizedMinutes % 60, 0, 0);
  return result;
}

export function getGhostEntryHeight(style: React.CSSProperties | undefined): number {
  const rawHeight = style?.height;
  const height =
    typeof rawHeight === 'number' ? rawHeight : parseFloat(rawHeight?.toString() ?? '');
  return Number.isFinite(height) && height > 0 ? height : 20;
}

/** CalendarGridContent コンポーネントのプロパティ */
export interface CalendarGridContentProps {
  /** この列が担当する日付 */
  date: Date;
  /** 表示するエントリ一覧 */
  entries: CalendarEvent[];
  /** 計算済みのエントリスタイル（position/size） */
  entryStyles: Record<string, React.CSSProperties>;
  /** ビューモード（useInteraction に渡す） */
  viewMode?: 'day' | '3day' | '5day' | 'week';
  /** この列の日付インデックス（DayView=0, Week/MultiDay=列番号） */
  dayIndex: number;
  /** 重複チェック用の全イベント（週/複数日ビュー用） */
  allEventsForOverlapCheck?: CalendarEvent[];
  /** 表示日付リスト（週/複数日ビュー用） */
  displayDates?: Date[];
  /** エントリクリック */
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  /** エントリ右クリック */
  onEntryContextMenu?: ((entry: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  /** D&D/リサイズ時の更新コールバック */
  onEventUpdate?:
    | ((
        eventId: string,
        updates: { startTime: Date; endTime: Date; resetActualTime?: boolean },
      ) => Promise<void | { skipToast: true }> | void)
    | undefined;
  /** 時間範囲選択 */
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  /** DnDを無効化するエントリID */
  disabledEntryId?: string | null | undefined;
  className?: string | undefined;
}

// ========================================
// Component
// ========================================

/** カレンダーグリッドの1日分コンテンツ（全ビュー共通） */
export const CalendarGridContent = React.memo(function CalendarGridContent({
  date,
  entries,
  entryStyles,
  viewMode = 'day',
  dayIndex,
  allEventsForOverlapCheck,
  displayDates,
  onEntryClick,
  onEntryContextMenu,
  onEventUpdate,
  onTimeRangeSelect,
  disabledEntryId,
  className,
}: CalendarGridContentProps) {
  const t = useTranslations();
  const [gapCreationCutoffMs] = useState(() => Date.now());
  const { getTagById } = useTagsMap();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const HOUR_HEIGHT = useResponsiveHourHeight();
  const gridHeight = 24 * HOUR_HEIGHT;

  // Tag タップで開いている draft entry（同日のときだけ block を描画）
  const tagDraft = useTagDraftStore((s) => s.draft);

  // 日付間ドラッグ（day以外のビューで使用）
  const enableCrossDayDrag = viewMode !== 'day';

  // 記録付きエントリのドラッグ確認ダイアログ（予定だけ移動、記録はそのまま）
  const [pendingDrop, setPendingDrop] = useState<{
    entryId: string;
    updates: { startTime: Date; endTime: Date };
  } | null>(null);

  const wrappedOnEventUpdate = useCallback(
    (eventId: string, updates: { startTime: Date; endTime: Date; resetActualTime?: boolean }) => {
      const entry = entries.find((e) => e.id === eventId);
      if (entry && actualDiffersFromPlanned(entry)) {
        setPendingDrop({ entryId: eventId, updates });
        return;
      }
      return onEventUpdate?.(eventId, updates);
    },
    [entries, onEventUpdate],
  );

  const handleConfirmDrop = useCallback(() => {
    if (!pendingDrop) return;
    onEventUpdate?.(pendingDrop.entryId, { ...pendingDrop.updates, resetActualTime: true });
    setPendingDrop(null);
  }, [pendingDrop, onEventUpdate]);

  const handleCancelDrop = useCallback(() => {
    setPendingDrop(null);
  }, []);

  // 自カラムに関係するドラッグ状態のみ購読（プリミティブ値で参照安定性を確保）
  const globalDraggedEntryId = useCalendarDragStore((s) =>
    s.isDragging && (s.originalDateIndex === dayIndex || s.targetDateIndex === dayIndex)
      ? s.draggedEntryId
      : null,
  );
  const isSourceColumnMovingAway = useCalendarDragStore(
    (s) => s.isDragging && s.originalDateIndex === dayIndex && s.targetDateIndex !== dayIndex,
  );

  // 統合インタラクション（drag/resize/click）
  const { state, handlers } = useInteraction({
    date,
    events: entries,
    ...(allEventsForOverlapCheck ? { allEventsForOverlapCheck } : {}),
    ...(displayDates ? { displayDates } : {}),
    viewMode,
    hourHeight: HOUR_HEIGHT,
    ...(onEventUpdate ? { onEventUpdate: wrappedOnEventUpdate } : {}),
    ...(onEntryClick ? { onEventClick: onEntryClick } : {}),
    ...(disabledEntryId != null
      ? {
          disabledPlanId: disabledEntryId,
          // Mobile では Inspector 開いている entry も resize 可（PC は Phase 1 と同じ block 維持）
          resizeDisabledPlanId: isMobile ? null : disabledEntryId,
        }
      : {}),
  });

  const isActive = state.mode !== 'idle';
  const isDragging = state.mode === 'dragging';
  const isResizing = state.mode === 'resizing';

  // ドラッグゴースト描画コールバック
  const renderGhost = useCallback(
    ({ entryId, previewTime }: { entryId: string; previewTime: { start: Date; end: Date } }) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return null;
      const tag = entry.tagId ? getTagById(entry.tagId) : null;
      // ゴーストは予定部分のみ表示（実績時間を除外してオーバーレイを抑制）
      const ghostEntry = { ...entry, actualStartDate: null, actualEndDate: null };
      const ghostHeight = getGhostEntryHeight(entryStyles[entryId]);
      return (
        <EntryCard
          entry={ghostEntry}
          tagName={tag?.name ?? null}
          tagColor={tag?.color ?? null}
          isMobile={isMobile}
          position={{ top: 0, left: 0, width: 100, height: ghostHeight }}
          plannedHeight={ghostHeight}
          previewTime={previewTime}
          style={{ position: 'relative', height: '100%' }}
        />
      );
    },
    [entries, entryStyles, getTagById, isMobile],
  );

  // 時間グリッド
  const timeGrid = React.useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className={`relative ${hour < 23 ? 'border-border border-b' : ''}`}
          style={{ height: HOUR_HEIGHT }}
        />
      )),
    [HOUR_HEIGHT],
  );

  return (
    <div
      className={cn(
        'relative flex-1',
        enableCrossDayDrag && isDragging ? 'overflow-visible' : 'overflow-hidden',
        enableCrossDayDrag && 'h-full',
        className,
      )}
      data-calendar-grid
      data-calendar-day-index={dayIndex}
    >
      {/* CalendarDragSelection: グリッド選択 + dnd-kit droppable */}
      <CalendarDragSelection
        date={date}
        dayIndex={dayIndex}
        className={cn('absolute inset-0', enableCrossDayDrag && 'z-10')}
        onTimeRangeSelect={onTimeRangeSelect}
        disabled={isActive}
        plans={allEventsForOverlapCheck ?? entries}
      >
        <div className="absolute inset-0" style={{ height: gridHeight }}>
          {timeGrid}
        </div>
      </CalendarDragSelection>

      {/* エントリ表示エリア */}
      <div className="pointer-events-none absolute inset-0 z-20" style={{ height: gridHeight }}>
        {entries.map((entry) => {
          const style = entryStyles[entry.id];
          if (!style) return null;

          const entryDragging = isDragging && (state as { entryId: string }).entryId === entry.id;
          const entryResizing = isResizing && (state as { entryId: string }).entryId === entry.id;

          return (
            <EntryRenderer
              key={entry.id}
              entry={entry}
              style={style}
              hourHeight={HOUR_HEIGHT}
              enableCrossDayDrag={enableCrossDayDrag}
              dayIndex={dayIndex}
              isDragging={isDragging}
              isResizing={isResizing}
              entryDragging={entryDragging}
              entryResizing={entryResizing}
              interactionState={state}
              globalDraggedEntryId={globalDraggedEntryId}
              isSourceColumnMovingAway={isSourceColumnMovingAway}
              onEntryClick={onEntryClick}
              onEntryContextMenu={onEntryContextMenu}
              onPointerDown={handlers.handlePointerDown}
              onTouchStart={handlers.handleTouchStart}
              onResizeStart={handlers.handleResizeStart}
              entries={entries}
              onGapClick={
                onTimeRangeSelect
                  ? (startMinutes, endMinutes) => {
                      if (minutesToDate(date, endMinutes).getTime() > gapCreationCutoffMs) {
                        return;
                      }
                      onTimeRangeSelect(minutesToSelection(date, startMinutes, endMinutes));
                    }
                  : undefined
              }
              gapCreationCutoffMs={gapCreationCutoffMs}
            />
          );
        })}

        <InlineTagPalette hourHeight={HOUR_HEIGHT} {...(enableCrossDayDrag ? { date } : {})} />

        {/* Tag タップで作成中の draft entry を該当日に描画 */}
        {tagDraft && isSameDay(tagDraft.date, date) && (
          <DraftEntryBlock draft={tagDraft} hourHeight={HOUR_HEIGHT} />
        )}
      </div>

      {/* React Portal ゴースト（DOM clone廃止） */}
      <GhostRenderer state={state} renderGhost={renderGhost} />

      {/* 記録付きエントリのドラッグ確認ダイアログ */}
      <ConfirmDialog
        open={pendingDrop !== null}
        onClose={handleCancelDrop}
        onConfirm={handleConfirmDrop}
        title={t('calendar.event.moveWithRecord.title')}
        description={t('calendar.event.moveWithRecord.description')}
        variant="warning"
        confirmLabel={t('calendar.event.moveWithRecord.confirm')}
      />
    </div>
  );
});
