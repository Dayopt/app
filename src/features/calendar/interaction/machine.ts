/**
 * Interaction State Machine — 純粋レデューサー
 *
 * React/DOM依存ゼロ。すべての状態遷移とグリッド計算を純粋関数で実装。
 * テスト: expect(interactionReducer(state, action, ctx)).toEqual(...)
 */

import {
  DEFAULT_SNAP_INTERVAL,
  pixelsToTimeUnsnapped,
  snapDeltaToGrid,
  snapToGrid,
} from './time-math';
import type {
  InteractionAction,
  InteractionContext,
  InteractionEffect,
  InteractionResult,
  InteractionState,
  Point,
  TimeRange,
} from './types';

// Re-export for consumers that import from machine.ts
export { snapToGrid } from './time-math';

// ========================================
// Constants
// ========================================

/** マウスドラッグ起動閾値（px） */
export const DRAG_THRESHOLD_PX = 5;

/** タッチ移動でロングプレスをキャンセルする閾値（px） — スクロール許容のため */
export const TOUCH_SCROLL_THRESHOLD_PX = 10;

/** イベントドラッグのロングプレス遅延（ms） */
export const LONGPRESS_DELAY_MS = 500;

/** グリッド選択のロングプレス遅延（ms） */
export const SELECTION_LONGPRESS_DELAY_MS = 300;

/** アイドル状態の初期値 */
export const IDLE: InteractionState = { mode: 'idle' };

// ========================================
// Helpers
// ========================================

function maxAbsDelta(a: Point, b: Point): number {
  return Math.max(Math.abs(a.clientX - b.clientX), Math.abs(a.clientY - b.clientY));
}

/** Build a TimeRange from hour/minute + duration */
function buildTimeRange(
  targetDate: Date,
  hour: number,
  minute: number,
  durationMs: number,
): TimeRange {
  const start = new Date(targetDate);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + durationMs);
  return { start, end };
}

/** Resolve the target date for a given date index */
function resolveTargetDate(ctx: InteractionContext, targetDateIndex: number): Date {
  if (ctx.viewMode !== 'day' && ctx.displayDates?.[targetDateIndex]) {
    return ctx.displayDates[targetDateIndex];
  }
  return ctx.date;
}

/** Build a time range for a grid selection (downward only from startY) */
function buildSelectionRange(
  startY: number,
  endY: number,
  hourHeight: number,
  targetDate: Date,
  intervalMin: number,
): TimeRange {
  const startSnap = snapToGrid(startY, hourHeight, intervalMin);
  // 下方向のみ: endY が startY より上なら startY に固定
  const clampedEndY = Math.max(endY, startY);
  const endSnap = snapToGrid(clampedEndY, hourHeight, intervalMin);

  // Ensure minimum one-interval selection
  let endHour = endSnap.hour;
  let endMinute = endSnap.minute;
  if (startSnap.hour === endHour && startSnap.minute === endMinute) {
    endMinute += intervalMin;
    if (endMinute >= 60) {
      endMinute = 0;
      endHour = Math.min(23, endHour + 1);
    }
  }

  const start = new Date(targetDate);
  start.setHours(startSnap.hour, startSnap.minute, 0, 0);
  const end = new Date(targetDate);
  end.setHours(endHour, endMinute, 0, 0);

  return { start, end };
}

// ========================================
// Reducer
// ========================================

/**
 * インタラクション状態機械の純粋レデューサー
 * @param state - 現在の状態
 * @param action - 発行されたアクション
 * @param ctx - グリッドのコンテキスト情報
 * @returns 新しい状態とサイドエフェクトのリスト
 */
export function interactionReducer(
  state: InteractionState,
  action: InteractionAction,
  ctx: InteractionContext,
): InteractionResult {
  const effects: InteractionEffect[] = [];
  const interval = ctx.snapIntervalMinutes ?? DEFAULT_SNAP_INTERVAL;

  switch (action.type) {
    // ---- Event drag initiation ----

    case 'POINTER_DOWN': {
      if (state.mode !== 'idle') return { state, effects };
      return {
        state: {
          mode: 'pending',
          entryId: action.entryId,
          startPoint: action.point,
          originalPosition: action.originalPosition,
          dateIndex: action.dateIndex,
        },
        effects,
      };
    }

    case 'TOUCH_START': {
      if (state.mode !== 'idle') return { state, effects };
      effects.push({ type: 'START_LONGPRESS_TIMER', delayMs: LONGPRESS_DELAY_MS });
      return {
        state: {
          mode: 'longpress-pending',
          entryId: action.entryId,
          startPoint: action.point,
          originalPosition: action.originalPosition,
          dateIndex: action.dateIndex,
        },
        effects,
      };
    }

    case 'LONGPRESS_FIRED': {
      if (state.mode !== 'longpress-pending') return { state, effects };

      // 移動前なので元の位置をそのまま使う（snap で 10:07 → 10:00 に潰さない）
      const { hour, minute } = pixelsToTimeUnsnapped(state.originalPosition.top, ctx.hourHeight);
      const snappedTop = state.originalPosition.top;
      const targetDate = resolveTargetDate(ctx, state.dateIndex);
      const durationMs = ctx.getEntryDurationMs(state.entryId);
      const previewTime = buildTimeRange(targetDate, hour, minute, durationMs);

      effects.push({ type: 'HAPTIC', pattern: 'impact' });
      effects.push({
        type: 'DRAG_STORE_START',
        entryId: state.entryId,
        dateIndex: state.dateIndex,
      });

      return {
        state: {
          mode: 'dragging',
          entryId: state.entryId,
          startPoint: state.startPoint,
          currentPoint: state.startPoint,
          originalPosition: state.originalPosition,
          dateIndex: state.dateIndex,
          targetDateIndex: state.dateIndex,
          snappedTop,
          previewTime,
          isOverlapping: false,
        },
        effects,
      };
    }

    // ---- Resize initiation ----

    case 'RESIZE_START': {
      if (state.mode !== 'idle') return { state, effects };

      // resize 開始時はまだ移動していないので、元の位置をそのまま preview にする
      const { hour: sH, minute: sM } = pixelsToTimeUnsnapped(
        action.originalPosition.top,
        ctx.hourHeight,
      );
      const endTop = action.originalPosition.top + action.originalPosition.height;
      const { hour: eH, minute: eM } = pixelsToTimeUnsnapped(endTop, ctx.hourHeight);

      const start = new Date(ctx.date);
      start.setHours(sH, sM, 0, 0);
      const end = new Date(ctx.date);
      end.setHours(eH, eM, 0, 0);

      return {
        state: {
          mode: 'resizing',
          entryId: action.entryId,
          startPoint: action.point,
          currentPoint: action.point,
          originalPosition: action.originalPosition,
          direction: action.direction,
          snappedHeight: action.originalPosition.height,
          previewTime: { start, end },
          isOverlapping: false,
        },
        effects,
      };
    }

    // ---- Grid selection initiation ----

    case 'GRID_POINTER_DOWN': {
      if (state.mode !== 'idle') return { state, effects };

      const targetDate = resolveTargetDate(ctx, action.dateIndex);
      const selectionRange = buildSelectionRange(
        action.gridY,
        action.gridY,
        ctx.hourHeight,
        targetDate,
        interval,
      );

      return {
        state: {
          mode: 'selecting',
          startPoint: action.point,
          currentPoint: action.point,
          dateIndex: action.dateIndex,
          gridStartY: action.gridY,
          selectionRange,
          isOverlapping: false,
        },
        effects,
      };
    }

    case 'GRID_TOUCH_START': {
      if (state.mode !== 'idle') return { state, effects };
      effects.push({
        type: 'START_LONGPRESS_TIMER',
        delayMs: SELECTION_LONGPRESS_DELAY_MS,
      });
      return {
        state: {
          mode: 'selection-longpress-pending',
          startPoint: action.point,
          dateIndex: action.dateIndex,
          gridStartY: action.gridY,
        },
        effects,
      };
    }

    case 'GRID_LONGPRESS_FIRED': {
      if (state.mode !== 'selection-longpress-pending') return { state, effects };

      const targetDate = resolveTargetDate(ctx, state.dateIndex);
      const selectionRange = buildSelectionRange(
        state.gridStartY,
        state.gridStartY,
        ctx.hourHeight,
        targetDate,
        interval,
      );

      effects.push({ type: 'HAPTIC', pattern: 'tap' });

      return {
        state: {
          mode: 'selecting',
          startPoint: state.startPoint,
          currentPoint: state.startPoint,
          dateIndex: state.dateIndex,
          gridStartY: state.gridStartY,
          selectionRange,
          isOverlapping: false,
        },
        effects,
      };
    }

    // ---- Movement ----

    case 'POINTER_MOVE':
      return handlePointerMove(state, action, ctx, effects, interval);

    // ---- Release ----

    case 'POINTER_UP':
      return handlePointerUp(state, effects);

    // ---- Cancel ----

    case 'CANCEL': {
      if (state.mode === 'longpress-pending' || state.mode === 'selection-longpress-pending') {
        effects.push({ type: 'CLEAR_LONGPRESS_TIMER' });
      }
      if (state.mode === 'dragging') {
        effects.push({ type: 'DRAG_STORE_END' });
      }
      return { state: IDLE, effects };
    }

    default:
      return { state, effects };
  }
}

// ========================================
// POINTER_MOVE handler (per-mode routing)
// ========================================

function handlePointerMove(
  state: InteractionState,
  action: { type: 'POINTER_MOVE'; point: Point; targetDateIndex?: number },
  ctx: InteractionContext,
  effects: InteractionEffect[],
  interval: number,
): InteractionResult {
  switch (state.mode) {
    case 'pending': {
      if (maxAbsDelta(state.startPoint, action.point) <= DRAG_THRESHOLD_PX) {
        return { state, effects };
      }
      // Threshold crossed → transition to dragging
      // relative offset snap: deltaY だけを snap し、original の :07 などを保持する
      const deltaY = action.point.clientY - state.startPoint.clientY;
      const snappedDeltaY = snapDeltaToGrid(deltaY, ctx.hourHeight, interval);
      const snappedTop = state.originalPosition.top + snappedDeltaY;
      const { hour, minute } = pixelsToTimeUnsnapped(snappedTop, ctx.hourHeight);
      const targetDateIndex = action.targetDateIndex ?? state.dateIndex;
      const targetDate = resolveTargetDate(ctx, targetDateIndex);
      const durationMs = ctx.getEntryDurationMs(state.entryId);
      const previewTime = buildTimeRange(targetDate, hour, minute, durationMs);
      const isOverlapping = ctx.checkOverlap(state.entryId, previewTime.start, previewTime.end);

      effects.push({
        type: 'DRAG_STORE_START',
        entryId: state.entryId,
        dateIndex: state.dateIndex,
      });

      return {
        state: {
          mode: 'dragging',
          entryId: state.entryId,
          startPoint: state.startPoint,
          currentPoint: action.point,
          originalPosition: state.originalPosition,
          dateIndex: state.dateIndex,
          targetDateIndex,
          snappedTop,
          previewTime,
          isOverlapping,
        },
        effects,
      };
    }

    case 'longpress-pending': {
      if (maxAbsDelta(state.startPoint, action.point) > TOUCH_SCROLL_THRESHOLD_PX) {
        effects.push({ type: 'CLEAR_LONGPRESS_TIMER' });
        return { state: IDLE, effects };
      }
      return { state, effects };
    }

    case 'dragging': {
      // relative offset snap: deltaY だけを snap し、original の :07 などを保持する
      const deltaY = action.point.clientY - state.startPoint.clientY;
      const snappedDeltaY = snapDeltaToGrid(deltaY, ctx.hourHeight, interval);
      const snappedTop = state.originalPosition.top + snappedDeltaY;
      const { hour, minute } = pixelsToTimeUnsnapped(snappedTop, ctx.hourHeight);
      const targetDateIndex = action.targetDateIndex ?? state.targetDateIndex;
      const targetDate = resolveTargetDate(ctx, targetDateIndex);
      const durationMs = ctx.getEntryDurationMs(state.entryId);
      const previewTime = buildTimeRange(targetDate, hour, minute, durationMs);
      const isOverlapping = ctx.checkOverlap(state.entryId, previewTime.start, previewTime.end);

      if (snappedTop !== state.snappedTop) {
        effects.push({ type: 'HAPTIC', pattern: 'tap' });
      }
      effects.push({ type: 'DRAG_STORE_UPDATE', targetDateIndex });

      return {
        state: {
          ...state,
          currentPoint: action.point,
          targetDateIndex,
          snappedTop,
          previewTime,
          isOverlapping,
        },
        effects,
      };
    }

    case 'resizing': {
      // relative offset snap: 開始位置は元の値を保持、resize の delta だけを snap する
      const deltaY = action.point.clientY - state.startPoint.clientY;
      const snappedDeltaY = snapDeltaToGrid(deltaY, ctx.hourHeight, interval);
      const minHeight = (ctx.hourHeight / 60) * interval;
      const newHeight = Math.max(minHeight, state.originalPosition.height + snappedDeltaY);

      if (newHeight !== state.snappedHeight) {
        effects.push({ type: 'HAPTIC', pattern: 'tap' });
      }

      // start は元の位置をそのまま使い、:07 などを保持
      const { hour: sH, minute: sM } = pixelsToTimeUnsnapped(
        state.originalPosition.top,
        ctx.hourHeight,
      );
      const endTop = state.originalPosition.top + newHeight;
      const { hour: eH, minute: eM } = pixelsToTimeUnsnapped(endTop, ctx.hourHeight);

      const start = new Date(ctx.date);
      start.setHours(sH, sM, 0, 0);
      const end = new Date(ctx.date);
      end.setHours(eH, eM, 0, 0);

      const previewTime: TimeRange = { start, end };
      const isOverlapping = ctx.checkOverlap(state.entryId, start, end);

      return {
        state: {
          ...state,
          currentPoint: action.point,
          snappedHeight: newHeight,
          previewTime,
          isOverlapping,
        },
        effects,
      };
    }

    case 'selecting': {
      const deltaY = action.point.clientY - state.startPoint.clientY;
      const currentGridY = state.gridStartY + deltaY;
      const targetDate = resolveTargetDate(ctx, state.dateIndex);
      const selectionRange = buildSelectionRange(
        state.gridStartY,
        currentGridY,
        ctx.hourHeight,
        targetDate,
        interval,
      );

      return {
        state: {
          ...state,
          currentPoint: action.point,
          selectionRange,
        },
        effects,
      };
    }

    case 'selection-longpress-pending': {
      if (maxAbsDelta(state.startPoint, action.point) > TOUCH_SCROLL_THRESHOLD_PX) {
        effects.push({ type: 'CLEAR_LONGPRESS_TIMER' });
        return { state: IDLE, effects };
      }
      return { state, effects };
    }

    default:
      return { state, effects };
  }
}

// ========================================
// POINTER_UP handler (per-mode completion)
// ========================================

function handlePointerUp(state: InteractionState, effects: InteractionEffect[]): InteractionResult {
  switch (state.mode) {
    case 'pending': {
      effects.push({ type: 'EVENT_CLICK', entryId: state.entryId });
      return { state: IDLE, effects };
    }

    case 'longpress-pending': {
      effects.push({ type: 'CLEAR_LONGPRESS_TIMER' });
      effects.push({ type: 'EVENT_CLICK', entryId: state.entryId });
      return { state: IDLE, effects };
    }

    case 'dragging': {
      effects.push({ type: 'DRAG_STORE_END' });

      if (state.isOverlapping) {
        effects.push({ type: 'DROP_REJECTED', entryId: state.entryId, reason: 'overlap' });
        effects.push({ type: 'HAPTIC', pattern: 'error' });
      } else {
        effects.push({
          type: 'DROP',
          entryId: state.entryId,
          time: state.previewTime,
          targetDateIndex: state.targetDateIndex,
        });
      }

      return { state: IDLE, effects };
    }

    case 'resizing': {
      if (state.isOverlapping) {
        effects.push({ type: 'RESIZE_REJECTED', entryId: state.entryId, reason: 'overlap' });
        effects.push({ type: 'HAPTIC', pattern: 'error' });
      } else {
        effects.push({
          type: 'RESIZE_COMPLETE',
          entryId: state.entryId,
          time: state.previewTime,
        });
      }
      return { state: IDLE, effects };
    }

    case 'selecting': {
      const hasMoved = maxAbsDelta(state.startPoint, state.currentPoint) > DRAG_THRESHOLD_PX;
      if (hasMoved && !state.isOverlapping) {
        effects.push({
          type: 'SELECT_COMPLETE',
          dateIndex: state.dateIndex,
          range: state.selectionRange,
        });
      }
      return { state: IDLE, effects };
    }

    case 'selection-longpress-pending': {
      effects.push({ type: 'CLEAR_LONGPRESS_TIMER' });
      return { state: IDLE, effects };
    }

    default:
      return { state: IDLE, effects };
  }
}
