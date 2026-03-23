import { create } from 'zustand';
import type { CalendarEvent } from '../types/calendar.types';

/** パネルドラッグ用のエントリデータ（最小型） */
export interface DragEntryData {
  id: string;
  title: string;
}

/**
 * カレンダーのドラッグ状態を管理するストア
 *
 * 日付間ドラッグ移動をサポートするため、
 * 複数のコンテンツコンポーネント（WeekContent等）で
 * ドラッグ状態を共有する
 *
 * dragSource で「カレンダー内ドラッグ」と「パネルからのドラッグ」を区別
 */

/** ドラッグ元の種類 */
export type DragSource = 'calendar' | 'panel' | null;

export interface CalendarDragState {
  /** ドラッグ元 */
  dragSource: DragSource;
  /** ドラッグ中のプランID */
  draggedPlanId: string | null;
  /** ドラッグ中のプランデータ（カレンダー内ドラッグ用） */
  draggedPlan: CalendarEvent | null;
  /** ドラッグ中のプランデータ（パネルドラッグ用） */
  draggedPlanData: DragEntryData | null;
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
  /** ドラッグ中のプレビューが既存エントリと重複しているか */
  isOverlapping: boolean;
}

interface CalendarDragActions {
  /** カレンダー内ドラッグ開始 */
  startDrag: (planId: string, plan: CalendarEvent, dateIndex: number) => void;
  /** パネルからのドラッグ開始 */
  startPanelDrag: (plan: DragEntryData) => void;
  /** ドラッグ中の状態更新 */
  updateDrag: (
    updates: Partial<
      Omit<CalendarDragState, 'draggedPlanId' | 'draggedPlan' | 'draggedPlanData' | 'dragSource'>
    >,
  ) => void;
  /** ドラッグ終了 */
  endDrag: () => void;
  /** ターゲット日付インデックスを更新 */
  setTargetDateIndex: (index: number) => void;
  /** プレビュー時間を更新 */
  setPreviewTime: (time: { start: Date; end: Date } | null) => void;
}

const initialState: CalendarDragState = {
  dragSource: null,
  draggedPlanId: null,
  draggedPlan: null,
  draggedPlanData: null,
  originalDateIndex: 0,
  targetDateIndex: 0,
  isDragging: false,
  previewTime: null,
  snappedPosition: null,
  isOverlapping: false,
};

/** カレンダーのドラッグ状態を管理するZustandストア */
export const useCalendarDragStore = create<CalendarDragState & CalendarDragActions>((set) => ({
  ...initialState,

  startDrag: (planId, plan, dateIndex) =>
    set({
      dragSource: 'calendar',
      draggedPlanId: planId,
      draggedPlan: plan,
      draggedPlanData: null,
      originalDateIndex: dateIndex,
      targetDateIndex: dateIndex,
      isDragging: true,
      previewTime: null,
      snappedPosition: null,
    }),

  startPanelDrag: (plan) =>
    set({
      dragSource: 'panel',
      draggedPlanId: plan.id,
      draggedPlan: null,
      draggedPlanData: plan,
      originalDateIndex: -1,
      targetDateIndex: -1,
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

  setTargetDateIndex: (index) =>
    set((state) => ({
      ...state,
      targetDateIndex: index,
    })),

  setPreviewTime: (time) =>
    set((state) => ({
      ...state,
      previewTime: time,
    })),
}));
