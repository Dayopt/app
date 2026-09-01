/**
 * Interaction State Machine — POINTER_MOVE handler (per-mode routing)
 */

import { crossedHapticBoundary, MIN_TIMEBLOCK_DURATION_MINUTES } from '../precision';
import {
  buildDragTimeRange,
  buildSelectionRange,
  clampSnappedTopToDay,
  maxAbsDelta,
  resolveTargetDate,
  snapEndToGrid,
} from './grid-geometry';
import { DRAG_THRESHOLD_PX, IDLE, TOUCH_SCROLL_THRESHOLD_PX } from './machine-constants';
import { snapToGrid } from './time-math';
import type {
  InteractionContext,
  InteractionEffect,
  InteractionResult,
  InteractionState,
  Point,
  TimeRange,
} from './types';

export function handlePointerMove(
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
      const deltaY = action.point.clientY - state.startPoint.clientY;
      const durationMs = ctx.getTimeblockDurationMs(state.timeblockId);
      const durationPx = (durationMs / 60_000) * (ctx.hourHeight / 60);
      const rawTop = clampSnappedTopToDay(
        state.originalPosition.top + deltaY,
        ctx.hourHeight,
        durationPx,
      );
      const startSnap = snapToGrid(rawTop, ctx.hourHeight, interval);
      const endSnap = snapEndToGrid(rawTop + durationPx, ctx.hourHeight, interval);
      const targetDateIndex = action.targetDateIndex ?? state.dateIndex;
      const targetDate = resolveTargetDate(ctx, targetDateIndex);
      const previewTime = buildDragTimeRange(targetDate, startSnap, endSnap, interval);
      const isOverlapping = ctx.checkOverlap(
        state.timeblockId,
        previewTime.start,
        previewTime.end,
        'drag',
      );

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
          currentPoint: action.point,
          originalPosition: state.originalPosition,
          dateIndex: state.dateIndex,
          targetDateIndex,
          snappedTop: startSnap.snappedTop,
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
      const deltaY = action.point.clientY - state.startPoint.clientY;
      const durationMs = ctx.getTimeblockDurationMs(state.timeblockId);
      const durationPx = (durationMs / 60_000) * (ctx.hourHeight / 60);
      const rawTop = clampSnappedTopToDay(
        state.originalPosition.top + deltaY,
        ctx.hourHeight,
        durationPx,
      );
      const startSnap = snapToGrid(rawTop, ctx.hourHeight, interval);
      const endSnap = snapEndToGrid(rawTop + durationPx, ctx.hourHeight, interval);
      const targetDateIndex = action.targetDateIndex ?? state.targetDateIndex;
      const targetDate = resolveTargetDate(ctx, targetDateIndex);
      const previewTime = buildDragTimeRange(targetDate, startSnap, endSnap, interval);
      const isOverlapping = ctx.checkOverlap(
        state.timeblockId,
        previewTime.start,
        previewTime.end,
        'drag',
      );

      const prevStartMinutes = Math.round((state.snappedTop / ctx.hourHeight) * 60);
      const nextStartMinutes = startSnap.hour * 60 + startSnap.minute;
      if (crossedHapticBoundary(prevStartMinutes, nextStartMinutes)) {
        effects.push({ type: 'HAPTIC', pattern: 'tap' });
      }
      effects.push({ type: 'DRAG_STORE_UPDATE', targetDateIndex });

      return {
        state: {
          ...state,
          currentPoint: action.point,
          targetDateIndex,
          snappedTop: startSnap.snappedTop,
          previewTime,
          isOverlapping,
        },
        effects,
      };
    }

    case 'resizing': {
      const deltaY = action.point.clientY - state.startPoint.clientY;
      const minHeight = (ctx.hourHeight / 60) * Math.max(interval, MIN_TIMEBLOCK_DURATION_MINUTES);
      const resizeMinEndMinutes = ctx.getResizeMinEndMinutes?.(state.timeblockId) ?? null;
      const resizeMinEndTop =
        resizeMinEndMinutes == null
          ? 0
          : (Math.ceil(resizeMinEndMinutes / interval) * interval * ctx.hourHeight) / 60;
      // upper cap: end が当日内に収まる範囲
      const startSnap = snapToGrid(state.originalPosition.top, ctx.hourHeight, interval);
      const maxHeight = Math.max(minHeight, 24 * ctx.hourHeight - startSnap.snappedTop);
      const rawEndTop = Math.min(
        24 * ctx.hourHeight,
        Math.max(
          startSnap.snappedTop + minHeight,
          resizeMinEndTop,
          state.originalPosition.top + state.originalPosition.height + deltaY,
        ),
      );
      const endSnap = snapEndToGrid(rawEndTop, ctx.hourHeight, interval);
      const newHeight = Math.min(
        maxHeight,
        Math.max(minHeight, endSnap.snappedTop - startSnap.snappedTop),
      );

      const prevEndMinutes = Math.round(
        ((startSnap.snappedTop + state.snappedHeight) / ctx.hourHeight) * 60,
      );
      const nextEndMinutes = Math.round(((startSnap.snappedTop + newHeight) / ctx.hourHeight) * 60);
      if (crossedHapticBoundary(prevEndMinutes, nextEndMinutes)) {
        effects.push({ type: 'HAPTIC', pattern: 'tap' });
      }

      const start = new Date(ctx.date);
      start.setHours(startSnap.hour, startSnap.minute, 0, 0);
      const end = new Date(ctx.date);
      end.setHours(endSnap.hour, endSnap.minute, 0, 0);

      const previewTime: TimeRange = { start, end };
      const isOverlapping = ctx.checkOverlap(state.timeblockId, start, end, 'resize');

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
