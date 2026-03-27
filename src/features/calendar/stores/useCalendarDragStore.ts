import { create } from 'zustand';
import type { CalendarEvent } from '../types/calendar.types';

/**
 * カレンダーのドラッグ状態を管理するストア
 *
 * 日付間ドラッグ移動をサポートするため、
 * 複数のコンテンツコンポーネント（WeekContent等）で
 * ドラッグ状態を共有する
 */

export interface CalendarDragState {
  /** ドラッグ中のエントリーID */
  draggedEntryId: string | null;
  /** ドラッグ中のエントリーデータ */
  draggedEntry: CalendarEvent | null;
  /** 元の日付インデックス */
  originalDateIndex: number;
  /** 現在のターゲット日付インデックス */
  targetDateIndex: number;
  /** ドラッグ中かどうか */
  isDragging: boolean;
  /** プレビュー時間 */
  previewTime: { start: Date; end: Date } | null;
  /** スナップされた位置（top, height） */
  snappedPosition: { top: number; height?: number } | null;
}

interface CalendarDragActions {
  /** カレンダー内ドラッグ開始 */
  startDrag: (entryId: string, entry: CalendarEvent, dateIndex: number) => void;
  /** ドラッグ中の状態更新 */
  updateDrag: (
    updates: Partial<Omit<CalendarDragState, 'draggedEntryId' | 'draggedEntry'>>,
  ) => void;
  /** ドラッグ終了 */
  endDrag: () => void;
}

const initialState: CalendarDragState = {
  draggedEntryId: null,
  draggedEntry: null,
  originalDateIndex: 0,
  targetDateIndex: 0,
  isDragging: false,
  previewTime: null,
  snappedPosition: null,
};

/** カレンダーのドラッグ状態を管理するZustandストア */
export const useCalendarDragStore = create<CalendarDragState & CalendarDragActions>((set) => ({
  ...initialState,

  startDrag: (entryId, entry, dateIndex) =>
    set({
      draggedEntryId: entryId,
      draggedEntry: entry,
      originalDateIndex: dateIndex,
      targetDateIndex: dateIndex,
      isDragging: true,
      previewTime: null,
      snappedPosition: null,
    }),

  updateDrag: (updates) =>
    set((state) => ({
      ...state,
      ...updates,
    })),

  endDrag: () => set(initialState),
}));
