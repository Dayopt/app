/**
 * Interaction State Machine tests — リサイズの開始・移動・確定
 */

import { describe, expect, it } from 'vitest';

import { IDLE } from '../machine';
import type { InteractionState } from '../types';
import { createCtx, dispatch, origin, rect } from './machine-test-helpers';

describe('RESIZE_START', () => {
  it('idle → resizing with correct preview time', () => {
    const { state, effects } = dispatch(IDLE, {
      type: 'RESIZE_START',
      timeblockId: 'a',
      direction: 'bottom',
      point: origin,
      originalPosition: rect, // top: 540 (9:00), height: 60 (1h)
    });

    expect(state.mode).toBe('resizing');
    if (state.mode === 'resizing') {
      expect(state.timeblockId).toBe('a');
      expect(state.direction).toBe('bottom');
      expect(state.snappedHeight).toBe(60);
      expect(state.previewTime.start.getHours()).toBe(9);
      expect(state.previewTime.end.getHours()).toBe(10);
      expect(state.isOverlapping).toBe(false);
    }
    expect(effects).toHaveLength(0);
  });

  it('computes overlap for the snapped resize preview before any pointer move', () => {
    const { state } = dispatch(
      IDLE,
      {
        type: 'RESIZE_START',
        timeblockId: 'a',
        direction: 'bottom',
        point: origin,
        originalPosition: { top: 607, left: 0, width: 200, height: 60 },
      },
      createCtx({
        checkOverlap: (_timeblockId, start, end) =>
          start.getHours() === 10 && start.getMinutes() === 0 && end.getHours() === 11,
      }),
    );

    if (state.mode === 'resizing') {
      expect(state.previewTime.start.getMinutes()).toBe(0);
      expect(state.isOverlapping).toBe(true);
    }
  });

  it('keeps initial resize preview duration positive for short off-grid entries', () => {
    const { state } = dispatch(
      IDLE,
      {
        type: 'RESIZE_START',
        timeblockId: 'a',
        direction: 'bottom',
        point: origin,
        originalPosition: { top: 608, left: 0, width: 200, height: 8 },
      },
      createCtx({
        checkOverlap: (_timeblockId, start, end) => end.getTime() <= start.getTime(),
      }),
    );

    if (state.mode === 'resizing') {
      const durationMs = state.previewTime.end.getTime() - state.previewTime.start.getTime();
      expect(state.snappedHeight).toBe(15);
      expect(state.previewTime.start.getHours()).toBe(10);
      expect(state.previewTime.start.getMinutes()).toBe(15);
      expect(state.previewTime.end.getHours()).toBe(10);
      expect(state.previewTime.end.getMinutes()).toBe(30);
      expect(durationMs).toBe(15 * 60 * 1000);
      expect(state.isOverlapping).toBe(false);
    }
  });
});

// ========================================
// resizing → resizing (POINTER_MOVE)
// ========================================

describe('POINTER_MOVE while resizing', () => {
  const resizingState: InteractionState = {
    mode: 'resizing',
    timeblockId: 'a',
    startPoint: origin,
    currentPoint: origin,
    originalPosition: rect, // top: 540, height: 60
    direction: 'bottom',
    snappedHeight: 60,
    previewTime: {
      start: new Date('2026-01-15T09:00:00'),
      end: new Date('2026-01-15T10:00:00'),
    },
    isOverlapping: false,
  };

  it('updates height snapped to grid', () => {
    // Move 30px down → +30min → height should snap to 90 (1.5h)
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 30 };
    const { state } = dispatch(resizingState, { type: 'POINTER_MOVE', point: movedPoint });

    if (state.mode === 'resizing') {
      expect(state.snappedHeight).toBe(90); // 1.5 hours
      expect(state.previewTime.end.getHours()).toBe(10);
      expect(state.previewTime.end.getMinutes()).toBe(30);
    }
  });

  it('enforces minimum height of one snap interval', () => {
    // Move 50px up → try to make height 10px, should clamp to 15 (15min)
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY - 50 };
    const { state } = dispatch(resizingState, { type: 'POINTER_MOVE', point: movedPoint });

    if (state.mode === 'resizing') {
      expect(state.snappedHeight).toBe(15); // minimum = (60/60)*15 = 15px
    }
  });

  it('予定と記録がズレた entry は planned end を actual start より前へ縮めない', () => {
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY - 60 };
    const { state } = dispatch(
      resizingState,
      { type: 'POINTER_MOVE', point: movedPoint },
      createCtx({ getResizeMinEndMinutes: () => 9 * 60 + 30 }),
    );

    if (state.mode === 'resizing') {
      expect(state.snappedHeight).toBe(30);
      expect(state.previewTime.end.getHours()).toBe(9);
      expect(state.previewTime.end.getMinutes()).toBe(30);
    }
  });
});

// ========================================
// resizing → idle (POINTER_UP)
// ========================================

describe('POINTER_UP while resizing', () => {
  it('emits RESIZE_COMPLETE when no overlap', () => {
    const resizingState: InteractionState = {
      mode: 'resizing',
      timeblockId: 'a',
      startPoint: origin,
      currentPoint: { clientX: origin.clientX, clientY: origin.clientY + 30 },
      originalPosition: rect,
      direction: 'bottom',
      snappedHeight: 90,
      previewTime: {
        start: new Date('2026-01-15T09:00:00'),
        end: new Date('2026-01-15T10:30:00'),
      },
      isOverlapping: false,
    };

    const { state, effects } = dispatch(resizingState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'RESIZE_COMPLETE', timeblockId: 'a' }),
    );
  });

  it('emits RESIZE_REJECTED when overlapping', () => {
    const resizingState: InteractionState = {
      mode: 'resizing',
      timeblockId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: rect,
      direction: 'bottom',
      snappedHeight: 120,
      previewTime: {
        start: new Date('2026-01-15T09:00:00'),
        end: new Date('2026-01-15T11:00:00'),
      },
      isOverlapping: true,
    };

    const { state, effects } = dispatch(resizingState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'RESIZE_REJECTED', reason: 'overlap' }),
    );
    expect(effects).toContainEqual({ type: 'HAPTIC', pattern: 'error' });
  });
});

// ========================================
// Precision regression — drag/resize absolute grid snap
// ========================================
