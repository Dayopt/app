'use client';

import { useCallback, useState } from 'react';

import type { DragEndEvent, DragMoveEvent, DragStartEvent, Over } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { fromZonedTime } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useEntries, useEntryMutations } from '@/features/entry';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { useResponsiveHourHeight } from '../components/views/shared/hooks/useResponsiveHourHeight';
import { useHapticFeedback } from '../hooks/accessibility/useHapticFeedback';
import { useAutoScrollOnDrag } from '../hooks/useAutoScrollOnDrag';
import {
  addMinutesToTime,
  formatTimeString,
  parseTimeString,
  pixelsToTime,
} from '../interaction/time-math';
import { useCalendarDragStore } from '../stores/useCalendarDragStore';

interface DnDProviderProps {
  children: React.ReactNode;
}

// ========================================
// Helpers
// ========================================

/** ドロップ先の日付文字列を取得 */
function extractDateStr(dropDate: Date | string): string {
  if (dropDate instanceof Date) {
    const year = dropDate.getFullYear();
    const month = String(dropDate.getMonth() + 1).padStart(2, '0');
    const day = String(dropDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return dropDate;
}

/** 終了時刻文字列を計算（HH:mm 形式） */
function computeEndTime(startTime: string, durationMinutes: number): string {
  const parsed = parseTimeString(startTime);
  if (!parsed) return startTime;
  const end = addMinutesToTime(parsed.hour, parsed.minute, durationMinutes);
  return formatTimeString(end.hour, end.minute);
}

/**
 * dnd-kit イベントからドロップ時刻を解決
 *
 * 1. CalendarDropZone の dropTimeRef（over.data.current.time getter）
 * 2. フォールバック: activatorEvent.clientY + delta.y → data-calendar-day-index で列特定
 */
function resolveDropTime(event: DragMoveEvent | DragEndEvent, hourHeight: number): string | null {
  const { over, activatorEvent, delta } = event;
  if (!over?.data?.current) return null;

  const liveTime = over.data.current.time;
  if (liveTime) return liveTime as string;

  const dayIndex = over.data.current.dayIndex;
  if (typeof dayIndex !== 'number') return null;

  const pointerY = (activatorEvent as PointerEvent).clientY + (delta?.y ?? 0);
  const column = document.querySelector<HTMLElement>(`[data-calendar-day-index="${dayIndex}"]`);
  if (!column) return null;

  const rect = column.getBoundingClientRect();
  const relativeY = pointerY - rect.top;
  if (relativeY < 0) return null;

  const { hour, minute } = pixelsToTime(relativeY, hourHeight);
  return formatTimeString(hour, minute);
}

// ========================================
// Component
// ========================================

/**
 * DnDProvider — カレンダー内エントリ移動の DnD コンテキスト
 *
 * パレット→カレンダーはクリックで現在時刻に配置（DnD不要）。
 * カレンダー内操作（リサイズ/選択）は interaction/machine.ts が担当。
 */
export const DnDProvider = ({ children }: DnDProviderProps) => {
  const t = useTranslations();
  const { updateEntry } = useEntryMutations();
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const { tap, success } = useHapticFeedback();
  const hourHeight = useResponsiveHourHeight();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragPreviewTime, setDragPreviewTime] = useState<{ date: string; time?: string } | null>(
    null,
  );

  // 自動スクロール
  const { updatePointerY } = useAutoScrollOnDrag({ isActive: activeId !== null });

  // エントリ一覧（ドラッグ中のプレビュー用）
  const { data: entries } = useEntries();
  const activeplan = entries?.find((t) => t.id === activeId);

  // ドラッグセンサー設定
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  // ---- Handlers ----

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
      setDragPreviewTime(null);
      tap();
    },
    [tap],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      // 自動スクロール
      const activatorEvent = event.activatorEvent as PointerEvent | undefined;
      if (activatorEvent?.clientY != null) {
        updatePointerY(activatorEvent.clientY + (event.delta?.y ?? 0));
      }

      const { over } = event;

      if (!over) {
        setDragPreviewTime(null);
        return;
      }

      const dropData = over.data?.current;
      if (!dropData || !dropData.date) {
        setDragPreviewTime(null);
        return;
      }

      const computedTime = resolveDropTime(event, hourHeight);

      setDragPreviewTime({
        date: extractDateStr(dropData.date),
        ...(computedTime ? { time: computedTime } : {}),
      });
    },
    [hourHeight, updatePointerY],
  );

  /** 既存エントリのドロップ処理（移動） */
  const handleEntryDrop = useCallback(
    (planId: string, over: Over, event: DragEndEvent) => {
      const dropData = over.data?.current;
      if (!dropData || !dropData.date) {
        toast.error(t('calendar.toast.dropInvalid'));
        setActiveId(null);
        return;
      }

      try {
        const dateStr = extractDateStr(dropData.date);
        const dropTime = resolveDropTime(event, hourHeight);

        let start_time: string | null = null;
        let end_time: string | null = null;

        if (dropTime) {
          const parsed = parseTimeString(dropTime);
          if (!parsed) throw new Error(t('common.errors.calendar.invalidTimeFormat'));

          const draggedEntry = entries?.find((e) => e.id === planId);
          let durationMinutes = 60;
          if (draggedEntry?.start_time && draggedEntry?.end_time) {
            const startMs = new Date(draggedEntry.start_time).getTime();
            const endMs = new Date(draggedEntry.end_time).getTime();
            durationMinutes = Math.max(15, Math.round((endMs - startMs) / 60000));
          }

          const [year, month, day] = dateStr.split('-').map(Number);
          const zonedStart = new Date(year!, month! - 1, day!, parsed.hour, parsed.minute, 0);
          const zonedEnd = new Date(zonedStart.getTime() + durationMinutes * 60000);

          start_time = fromZonedTime(zonedStart, timezone).toISOString();
          end_time = fromZonedTime(zonedEnd, timezone).toISOString();
        }

        updateEntry.mutate({
          id: planId,
          data: { start_time, end_time },
        });
        success();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('calendar.toast.dropFailed'));
      } finally {
        setActiveId(null);
        setDragPreviewTime(null);
      }
    },
    [updateEntry, timezone, t, success, entries, hourHeight],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      useCalendarDragStore.getState().endDrag();

      if (!over) {
        setActiveId(null);
        return;
      }

      const dragData = active.data?.current;
      const dragType = dragData?.type;

      let currentPlanId: string;
      if (dragType === 'calendar-event') {
        const calendarEvent = dragData?.event;
        if (!calendarEvent?.id) {
          setActiveId(null);
          return;
        }
        currentPlanId = calendarEvent.id;
      } else {
        currentPlanId = active.id as string;
      }

      handleEntryDrop(currentPlanId, over, event);
    },
    [handleEntryDrop],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      {children}

      <DragOverlay style={{ pointerEvents: 'none' }}>
        {activeplan ? (
          <div className="surface-raised entry-tint border-l-indicator border-l-entry-default flex w-48 flex-col gap-0.5 rounded-r-lg p-2 opacity-90">
            <span className="text-foreground truncate text-sm font-normal">{activeplan.title}</span>
            {dragPreviewTime?.time && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {dragPreviewTime.time} –{' '}
                {computeEndTime(
                  dragPreviewTime.time,
                  activeplan?.start_time && activeplan?.end_time
                    ? Math.max(
                        15,
                        Math.round(
                          (new Date(activeplan.end_time).getTime() -
                            new Date(activeplan.start_time).getTime()) /
                            60000,
                        ),
                      )
                    : 60,
                )}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
