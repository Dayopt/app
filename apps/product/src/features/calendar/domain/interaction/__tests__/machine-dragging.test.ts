/**
 * Interaction State Machine tests — ドラッグ中の移動と確定
 */

import { describe, expect, it } from 'vitest';

import type { InteractionState } from '../types';
import { createCtx, dispatch, origin, rect } from './machine-test-helpers';

describe('POINTER_MOVE while dragging', () => {
  const draggingState: InteractionState = {
    mode: 'dragging',
    timeblockId: 'a',
    startPoint: origin,
    currentPoint: origin,
    originalPosition: rect, // top: 540 = 9:00
    dateIndex: 0,
    targetDateIndex: 0,
    snappedTop: 540,
    previewTime: {
      start: new Date('2026-01-15T09:00:00'),
      end: new Date('2026-01-15T10:00:00'),
    },
    isOverlapping: false,
  };

  it('updates snappedTop, previewTime, and targetDateIndex', () => {
    const movedPoint = {
      clientX: origin.clientX,
      clientY: origin.clientY + 60, // moved 1 hour down
    };
    const { state, effects } = dispatch(draggingState, {
      type: 'POINTER_MOVE',
      point: movedPoint,
      targetDateIndex: 1,
    });

    expect(state.mode).toBe('dragging');
    if (state.mode === 'dragging') {
      expect(state.snappedTop).toBe(600); // 10:00
      expect(state.previewTime.start.getHours()).toBe(10);
      expect(state.targetDateIndex).toBe(1);
      expect(state.currentPoint).toEqual(movedPoint);
    }
    expect(effects).toContainEqual({ type: 'DRAG_STORE_UPDATE', targetDateIndex: 1 });
  });

  it('detects overlap during drag', () => {
    const ctx = createCtx({ checkOverlap: () => true });
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 60 };
    const { state } = dispatch(draggingState, { type: 'POINTER_MOVE', point: movedPoint }, ctx);

    if (state.mode === 'dragging') {
      expect(state.isOverlapping).toBe(true);
    }
  });

  it('uses week view target date from displayDates', () => {
    const ctx = createCtx({
      viewMode: 'week',
      displayDates: [
        new Date('2026-01-12'), // Mon
        new Date('2026-01-13'), // Tue
        new Date('2026-01-14'), // Wed
        new Date('2026-01-15'), // Thu
        new Date('2026-01-16'), // Fri
      ],
    });
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 60 };
    const { state } = dispatch(
      draggingState,
      { type: 'POINTER_MOVE', point: movedPoint, targetDateIndex: 2 },
      ctx,
    );

    if (state.mode === 'dragging') {
      // Should use Wed (Jan 14) as target date
      expect(state.previewTime.start.getDate()).toBe(14);
    }
  });
});

// ========================================
// dragging → idle (POINTER_UP = drop)
// ========================================

describe('POINTER_UP while dragging', () => {
  it('emits DROP effect when no overlap', () => {
    const draggingState: InteractionState = {
      mode: 'dragging',
      timeblockId: 'a',
      startPoint: origin,
      currentPoint: { clientX: origin.clientX, clientY: origin.clientY + 60 },
      originalPosition: rect,
      dateIndex: 0,
      targetDateIndex: 1,
      snappedTop: 600,
      previewTime: {
        start: new Date('2026-01-15T10:00:00'),
        end: new Date('2026-01-15T11:00:00'),
      },
      isOverlapping: false,
    };

    const { state, effects } = dispatch(draggingState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual({ type: 'DRAG_STORE_END' });
    expect(effects).toContainEqual(
      expect.objectContaining({
        type: 'DROP',
        timeblockId: 'a',
        targetDateIndex: 1,
      }),
    );
    // No haptic error
    expect(effects).not.toContainEqual(
      expect.objectContaining({ type: 'HAPTIC', pattern: 'error' }),
    );
  });

  it('emits DROP_REJECTED and HAPTIC error when overlapping', () => {
    const draggingState: InteractionState = {
      mode: 'dragging',
      timeblockId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: rect,
      dateIndex: 0,
      targetDateIndex: 0,
      snappedTop: 540,
      previewTime: {
        start: new Date('2026-01-15T09:00:00'),
        end: new Date('2026-01-15T10:00:00'),
      },
      isOverlapping: true,
    };

    const { state, effects } = dispatch(draggingState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual({ type: 'DRAG_STORE_END' });
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'DROP_REJECTED', reason: 'overlap' }),
    );
    expect(effects).toContainEqual({ type: 'HAPTIC', pattern: 'error' });
  });
});

// ========================================
// idle → resizing (RESIZE_START)
// ========================================
