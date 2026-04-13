'use client';

import React, { useCallback, useState } from 'react';

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
import type { CalendarEvent } from '../../../../types/calendar.types';
import { useResponsiveHourHeight } from '../hooks/useResponsiveHourHeight';
import type { DateTimeSelection } from './CalendarDragSelection';
import { CalendarDragSelection } from './CalendarDragSelection';
import { EntryRenderer } from './EntryRenderer';
import { InlineTagPalette } from './InlineTagPalette';

// ========================================
// Types
// ========================================

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
  /** data-tour-target 属性（DayViewのみ） */
  dataTourTarget?: string | undefined;
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
  dataTourTarget,
  className,
}: CalendarGridContentProps) {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const HOUR_HEIGHT = useResponsiveHourHeight();
  const gridHeight = 24 * HOUR_HEIGHT;

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
      if (entry && (entry.actualStartDate || entry.actualEndDate)) {
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
    ...(disabledEntryId != null ? { disabledPlanId: disabledEntryId } : {}),
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
      return (
        <EntryCard
          entry={ghostEntry}
          tagName={tag?.name ?? null}
          tagColor={tag?.color ?? null}
          isMobile={isMobile}
          position={{ top: 0, left: 0, width: 100, height: 9999 }}
          previewTime={previewTime}
          style={{ position: 'relative', height: '100%' }}
        />
      );
    },
    [entries, getTagById, isMobile],
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
      {...(dataTourTarget ? { 'data-tour-target': dataTourTarget } : {})}
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
            />
          );
        })}

        <InlineTagPalette hourHeight={HOUR_HEIGHT} {...(enableCrossDayDrag ? { date } : {})} />
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
