/**
 * Interaction State Machine — 純粋レデューサー
 *
 * React/DOM依存ゼロ。すべての状態遷移とグリッド計算を純粋関数で実装。
 * テスト: expect(interactionReducer(state, action, ctx)).toEqual(...)
 *
 * 実装は責務ごとに分割している:
 * - 定数: machine-constants.ts
 * - グリッド幾何計算: grid-geometry.ts
 * - POINTER_MOVE: pointer-move.ts
 * - POINTER_UP: pointer-up.ts
 */

import { DEFAULT_DRAG_SNAP_MINUTES } from '../precision';
import {
  buildDragTimeRange,
  buildSelectionRange,
  ensureEndAfterStartSnap,
  resolveTargetDate,
  snapEndToGrid,
} from './grid-geometry';
import { IDLE, LONGPRESS_DELAY_MS, SELECTION_LONGPRESS_DELAY_MS } from './machine-constants';
import { handlePointerMove } from './pointer-move';
import { handlePointerUp } from './pointer-up';
import { snapToGrid } from './time-math';
import type {
  InteractionAction,
  InteractionContext,
  InteractionEffect,
  InteractionResult,
  InteractionState,
} from './types';

// Re-export for consumers that import from machine.ts
export {
  DRAG_THRESHOLD_PX,
  IDLE,
  LONGPRESS_DELAY_MS,
  SELECTION_LONGPRESS_DELAY_MS,
  TOUCH_SCROLL_THRESHOLD_PX,
} from './machine-constants';
export { snapToGrid } from './time-math';

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
  const interval = ctx.snapIntervalMinutes ?? DEFAULT_DRAG_SNAP_MINUTES;

  switch (action.type) {
    // ---- Event drag initiation ----

    case 'POINTER_DOWN': {
      if (state.mode !== 'idle') return { state, effects };
      return {
        state: {
          mode: 'pending',
          timeblockId: action.timeblockId,
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
          timeblockId: action.timeblockId,
          startPoint: action.point,
          originalPosition: action.originalPosition,
          dateIndex: action.dateIndex,
        },
        effects,
      };
    }

    case 'LONGPRESS_FIRED': {
      if (state.mode !== 'longpress-pending') return { state, effects };

      const durationMs = ctx.getTimeblockDurationMs(state.timeblockId);
      const durationPx = (durationMs / 60_000) * (ctx.hourHeight / 60);
      const startSnap = snapToGrid(state.originalPosition.top, ctx.hourHeight, interval);
      const endSnap = snapEndToGrid(
        state.originalPosition.top + durationPx,
        ctx.hourHeight,
        interval,
      );
      const targetDate = resolveTargetDate(ctx, state.dateIndex);
      const previewTime = buildDragTimeRange(targetDate, startSnap, endSnap, interval);
      const isOverlapping = ctx.checkOverlap(
        state.timeblockId,
        previewTime.start,
        previewTime.end,
        'drag',
      );

      effects.push({ type: 'HAPTIC', pattern: 'impact' });
      effects.push({
        type: 'DRAG_STORE_START',
        timeblockId: state.timeblockId,
        dateIndex: state.dateIndex,
      });

      return {
        state: {
          mode: 'dragging',
          timeblockId: state.timeblockId,
          startPoint: state.startPoint,
          currentPoint: state.startPoint,
          originalPosition: state.originalPosition,
          dateIndex: state.dateIndex,
          targetDateIndex: state.dateIndex,
          snappedTop: startSnap.snappedTop,
          previewTime,
          isOverlapping,
        },
        effects,
      };
    }

    // ---- Resize initiation ----

    case 'RESIZE_START': {
      if (state.mode !== 'idle') return { state, effects };

      const startSnap = snapToGrid(action.originalPosition.top, ctx.hourHeight, interval);
      const endTop = action.originalPosition.top + action.originalPosition.height;
      const endSnap = ensureEndAfterStartSnap(
        startSnap,
        snapEndToGrid(endTop, ctx.hourHeight, interval),
        ctx.hourHeight,
        interval,
      );

      const start = new Date(ctx.date);
      start.setHours(startSnap.hour, startSnap.minute, 0, 0);
      const end = new Date(ctx.date);
      end.setHours(endSnap.hour, endSnap.minute, 0, 0);
      const snappedHeight = Math.max(
        (ctx.hourHeight / 60) * interval,
        endSnap.snappedTop - startSnap.snappedTop,
      );
      const isOverlapping = ctx.checkOverlap(action.timeblockId, start, end, 'resize');

      return {
        state: {
          mode: 'resizing',
          timeblockId: action.timeblockId,
          startPoint: action.point,
          currentPoint: action.point,
          originalPosition: action.originalPosition,
          direction: action.direction,
          snappedHeight,
          previewTime: { start, end },
          isOverlapping,
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
