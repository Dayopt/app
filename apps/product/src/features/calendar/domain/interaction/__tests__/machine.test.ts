import { describe, expect, it } from 'vitest';

import {
  DRAG_THRESHOLD_PX,
  IDLE,
  LONGPRESS_DELAY_MS,
  SELECTION_LONGPRESS_DELAY_MS,
  TOUCH_SCROLL_THRESHOLD_PX,
  interactionReducer,
  snapToGrid,
} from '../machine';
import type {
  EntryRect,
  InteractionAction,
  InteractionContext,
  InteractionResult,
  InteractionState,
  Point,
} from '../types';

// ========================================
// Test helpers
// ========================================

function createCtx(overrides?: Partial<InteractionContext>): InteractionContext {
  return {
    hourHeight: 60,
    date: new Date('2026-01-15T00:00:00'),
    viewMode: 'day',
    getEntryDurationMs: () => 60 * 60 * 1000, // 1 hour
    checkOverlap: () => false,
    ...overrides,
  };
}

function dispatch(
  state: InteractionState,
  action: InteractionAction,
  ctx?: InteractionContext,
): InteractionResult {
  return interactionReducer(state, action, ctx ?? createCtx());
}

const origin: Point = { clientX: 100, clientY: 200 };
const rect: EntryRect = { top: 540, left: 0, width: 200, height: 60 }; // 9:00 at 60px/h

// ========================================
// snapToGrid
// ========================================

describe('snapToGrid', () => {
  it('snaps to 15-min intervals', () => {
    // 9:00 = 540px at 60px/h
    expect(snapToGrid(540, 60)).toEqual({ snappedTop: 540, hour: 9, minute: 0 });
  });

  it('snaps 9:07 → 9:00', () => {
    // 9:07 = 547px
    expect(snapToGrid(547, 60)).toEqual({ snappedTop: 540, hour: 9, minute: 0 });
  });

  it('snaps 9:08 → 9:15', () => {
    // 9:08 = 548px
    expect(snapToGrid(548, 60)).toEqual({ snappedTop: 555, hour: 9, minute: 15 });
  });

  it('snaps 9:52 → 9:45', () => {
    // 9:52 = 592px
    expect(snapToGrid(592, 60, 15)).toEqual({ snappedTop: 585, hour: 9, minute: 45 });
  });

  it('snaps 9:53 → 10:00', () => {
    // 9:53 = 593px
    expect(snapToGrid(593, 60, 15)).toEqual({ snappedTop: 600, hour: 10, minute: 0 });
  });

  it('clamps to 23:00 max', () => {
    expect(snapToGrid(9999, 60)).toEqual({ snappedTop: 1380, hour: 23, minute: 0 });
  });

  it('clamps to 0:00 min', () => {
    expect(snapToGrid(-10, 60)).toEqual({ snappedTop: 0, hour: 0, minute: 0 });
  });

  it('supports custom interval (30 min)', () => {
    // 9:20 → 9:30
    expect(snapToGrid(560, 60, 30)).toEqual({ snappedTop: 570, hour: 9, minute: 30 });
  });
});

// ========================================
// idle → pending (POINTER_DOWN)
// ========================================

describe('POINTER_DOWN', () => {
  it('idle → pending', () => {
    const { state, effects } = dispatch(IDLE, {
      type: 'POINTER_DOWN',
      entryId: 'a',
      point: origin,
      originalPosition: rect,
      dateIndex: 0,
    });

    expect(state.mode).toBe('pending');
    if (state.mode === 'pending') {
      expect(state.entryId).toBe('a');
      expect(state.startPoint).toEqual(origin);
      expect(state.originalPosition).toEqual(rect);
      expect(state.dateIndex).toBe(0);
    }
    expect(effects).toHaveLength(0);
  });

  it('ignores POINTER_DOWN when not idle', () => {
    const pendingState: InteractionState = {
      mode: 'pending',
      entryId: 'a',
      startPoint: origin,
      originalPosition: rect,
      dateIndex: 0,
    };
    const { state } = dispatch(pendingState, {
      type: 'POINTER_DOWN',
      entryId: 'b',
      point: { clientX: 0, clientY: 0 },
      originalPosition: rect,
      dateIndex: 0,
    });
    expect(state.mode).toBe('pending');
    if (state.mode === 'pending') {
      expect(state.entryId).toBe('a'); // unchanged
    }
  });
});

// ========================================
// idle → longpress-pending (TOUCH_START)
// ========================================

describe('TOUCH_START', () => {
  it('idle → longpress-pending with timer effect', () => {
    const { state, effects } = dispatch(IDLE, {
      type: 'TOUCH_START',
      entryId: 'a',
      point: origin,
      originalPosition: rect,
      dateIndex: 0,
    });

    expect(state.mode).toBe('longpress-pending');
    expect(effects).toContainEqual({
      type: 'START_LONGPRESS_TIMER',
      delayMs: LONGPRESS_DELAY_MS,
    });
  });
});

// ========================================
// longpress-pending → dragging (LONGPRESS_FIRED)
// ========================================

describe('LONGPRESS_FIRED', () => {
  const longpressState: InteractionState = {
    mode: 'longpress-pending',
    entryId: 'a',
    startPoint: origin,
    originalPosition: rect,
    dateIndex: 0,
  };

  it('transitions to dragging with haptic and drag store effects', () => {
    const { state, effects } = dispatch(longpressState, { type: 'LONGPRESS_FIRED' });

    expect(state.mode).toBe('dragging');
    if (state.mode === 'dragging') {
      expect(state.entryId).toBe('a');
      expect(state.targetDateIndex).toBe(0);
      expect(state.isOverlapping).toBe(false);
      // snappedTop should match original position (540 = 9:00)
      expect(state.snappedTop).toBe(540);
      expect(state.previewTime.start.getHours()).toBe(9);
    }

    expect(effects).toContainEqual({ type: 'HAPTIC', pattern: 'impact' });
    expect(effects).toContainEqual({
      type: 'DRAG_STORE_START',
      entryId: 'a',
      dateIndex: 0,
    });
  });

  it('computes overlap for the snapped long-press preview before any pointer move', () => {
    const { state } = dispatch(
      {
        mode: 'longpress-pending',
        entryId: 'a',
        startPoint: origin,
        originalPosition: { top: 607, left: 0, width: 200, height: 60 },
        dateIndex: 0,
      },
      { type: 'LONGPRESS_FIRED' },
      createCtx({
        checkOverlap: (_entryId, start, end) =>
          start.getHours() === 10 && start.getMinutes() === 0 && end.getHours() === 11,
      }),
    );

    if (state.mode === 'dragging') {
      expect(state.previewTime.start.getMinutes()).toBe(0);
      expect(state.isOverlapping).toBe(true);
    }
  });

  it('ignores when not in longpress-pending mode', () => {
    const { state } = dispatch(IDLE, { type: 'LONGPRESS_FIRED' });
    expect(state.mode).toBe('idle');
  });
});

// ========================================
// pending → dragging (POINTER_MOVE > threshold)
// ========================================

describe('POINTER_MOVE from pending', () => {
  const pendingState: InteractionState = {
    mode: 'pending',
    entryId: 'a',
    startPoint: origin,
    originalPosition: rect,
    dateIndex: 0,
  };

  it('stays pending when movement is below threshold', () => {
    const { state } = dispatch(pendingState, {
      type: 'POINTER_MOVE',
      point: { clientX: origin.clientX + 2, clientY: origin.clientY + 3 },
    });
    expect(state.mode).toBe('pending');
  });

  it('transitions to dragging when movement exceeds threshold', () => {
    const movedPoint = {
      clientX: origin.clientX,
      clientY: origin.clientY + DRAG_THRESHOLD_PX + 1,
    };
    const { state, effects } = dispatch(pendingState, {
      type: 'POINTER_MOVE',
      point: movedPoint,
    });

    expect(state.mode).toBe('dragging');
    if (state.mode === 'dragging') {
      expect(state.entryId).toBe('a');
      expect(state.currentPoint).toEqual(movedPoint);
      expect(state.previewTime.start).toBeInstanceOf(Date);
    }
    expect(effects).toContainEqual(expect.objectContaining({ type: 'DRAG_STORE_START' }));
  });

  it('computes overlap when transitioning to dragging', () => {
    const ctx = createCtx({ checkOverlap: () => true });
    const movedPoint = {
      clientX: origin.clientX,
      clientY: origin.clientY + 20,
    };
    const { state } = dispatch(pendingState, { type: 'POINTER_MOVE', point: movedPoint }, ctx);

    expect(state.mode).toBe('dragging');
    if (state.mode === 'dragging') {
      expect(state.isOverlapping).toBe(true);
    }
  });
});

// ========================================
// pending → idle (click via POINTER_UP)
// ========================================

describe('POINTER_UP from pending (click)', () => {
  it('returns to idle with EVENT_CLICK effect', () => {
    const pendingState: InteractionState = {
      mode: 'pending',
      entryId: 'a',
      startPoint: origin,
      originalPosition: rect,
      dateIndex: 0,
    };
    const { state, effects } = dispatch(pendingState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual({ type: 'EVENT_CLICK', entryId: 'a' });
  });
});

// ========================================
// longpress-pending → idle (scroll cancel)
// ========================================

describe('POINTER_MOVE from longpress-pending', () => {
  const longpressState: InteractionState = {
    mode: 'longpress-pending',
    entryId: 'a',
    startPoint: origin,
    originalPosition: rect,
    dateIndex: 0,
  };

  it('cancels long-press when finger moves beyond scroll threshold', () => {
    const movedPoint = {
      clientX: origin.clientX,
      clientY: origin.clientY + TOUCH_SCROLL_THRESHOLD_PX + 1,
    };
    const { state, effects } = dispatch(longpressState, {
      type: 'POINTER_MOVE',
      point: movedPoint,
    });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual({ type: 'CLEAR_LONGPRESS_TIMER' });
  });

  it('stays in longpress-pending when movement is small', () => {
    const movedPoint = {
      clientX: origin.clientX + 3,
      clientY: origin.clientY + 3,
    };
    const { state } = dispatch(longpressState, {
      type: 'POINTER_MOVE',
      point: movedPoint,
    });
    expect(state.mode).toBe('longpress-pending');
  });
});

// ========================================
// longpress-pending → idle (touch release before 500ms)
// ========================================

describe('POINTER_UP from longpress-pending (quick tap → click)', () => {
  it('fires EVENT_CLICK and clears timer', () => {
    const longpressState: InteractionState = {
      mode: 'longpress-pending',
      entryId: 'a',
      startPoint: origin,
      originalPosition: rect,
      dateIndex: 0,
    };
    const { state, effects } = dispatch(longpressState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual({ type: 'CLEAR_LONGPRESS_TIMER' });
    expect(effects).toContainEqual({ type: 'EVENT_CLICK', entryId: 'a' });
  });
});

// ========================================
// dragging → dragging (POINTER_MOVE update)
// ========================================

describe('POINTER_MOVE while dragging', () => {
  const draggingState: InteractionState = {
    mode: 'dragging',
    entryId: 'a',
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
      entryId: 'a',
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
        entryId: 'a',
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
      entryId: 'a',
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

describe('RESIZE_START', () => {
  it('idle → resizing with correct preview time', () => {
    const { state, effects } = dispatch(IDLE, {
      type: 'RESIZE_START',
      entryId: 'a',
      direction: 'bottom',
      point: origin,
      originalPosition: rect, // top: 540 (9:00), height: 60 (1h)
    });

    expect(state.mode).toBe('resizing');
    if (state.mode === 'resizing') {
      expect(state.entryId).toBe('a');
      expect(state.direction).toBe('bottom');
      expect(state.snappedHeight).toBe(60);
      expect(state.previewTime.start.getHours()).toBe(9);
      expect(state.previewTime.end.getHours()).toBe(10);
      expect(state.isOverlapping).toBe(false);
    }
    expect(effects).toHaveLength(0);
  });
});

// ========================================
// resizing → resizing (POINTER_MOVE)
// ========================================

describe('POINTER_MOVE while resizing', () => {
  const resizingState: InteractionState = {
    mode: 'resizing',
    entryId: 'a',
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
});

// ========================================
// resizing → idle (POINTER_UP)
// ========================================

describe('POINTER_UP while resizing', () => {
  it('emits RESIZE_COMPLETE when no overlap', () => {
    const resizingState: InteractionState = {
      mode: 'resizing',
      entryId: 'a',
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
      expect.objectContaining({ type: 'RESIZE_COMPLETE', entryId: 'a' }),
    );
  });

  it('emits RESIZE_REJECTED when overlapping', () => {
    const resizingState: InteractionState = {
      mode: 'resizing',
      entryId: 'a',
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

describe('precision regression: drag/resize snaps off-grid times to the absolute grid', () => {
  // 10:07 entry を表す originalPosition: top=607（hourHeight=60 で 10*60+7=607）
  const off607: EntryRect = { top: 607, left: 0, width: 200, height: 60 };

  it('LONGPRESS_FIRED on 10:07 entry → preview start snaps to 10:00', () => {
    const longpressState: InteractionState = {
      mode: 'longpress-pending',
      entryId: 'a',
      startPoint: origin,
      originalPosition: off607,
      dateIndex: 0,
    };
    const { state } = dispatch(longpressState, { type: 'LONGPRESS_FIRED' });

    expect(state.mode).toBe('dragging');
    if (state.mode === 'dragging') {
      expect(state.snappedTop).toBe(600);
      expect(state.previewTime.start.getHours()).toBe(10);
      expect(state.previewTime.start.getMinutes()).toBe(0);
    }
  });

  it('drag 10:07 → +30px → 10:30', () => {
    const draggingState: InteractionState = {
      mode: 'dragging',
      entryId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: off607,
      dateIndex: 0,
      targetDateIndex: 0,
      snappedTop: 607,
      previewTime: {
        start: new Date('2026-01-15T10:07:00'),
        end: new Date('2026-01-15T11:07:00'),
      },
      isOverlapping: false,
    };
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 30 };
    const { state } = dispatch(draggingState, { type: 'POINTER_MOVE', point: movedPoint });

    if (state.mode === 'dragging') {
      expect(state.snappedTop).toBe(630);
      expect(state.previewTime.start.getHours()).toBe(10);
      expect(state.previewTime.start.getMinutes()).toBe(30);
    }
  });

  it('drag 10:07 → +7px → 10:15', () => {
    const draggingState: InteractionState = {
      mode: 'dragging',
      entryId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: off607,
      dateIndex: 0,
      targetDateIndex: 0,
      snappedTop: 607,
      previewTime: {
        start: new Date('2026-01-15T10:07:00'),
        end: new Date('2026-01-15T11:07:00'),
      },
      isOverlapping: false,
    };
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 7 };
    const { state } = dispatch(draggingState, { type: 'POINTER_MOVE', point: movedPoint });

    if (state.mode === 'dragging') {
      expect(state.snappedTop).toBe(615);
      expect(state.previewTime.start.getMinutes()).toBe(15);
    }
  });

  it('5分snap設定では15:13 entryをdragすると15:15へ揃える', () => {
    const off913: EntryRect = { top: 913, left: 0, width: 200, height: 60 };
    const draggingState: InteractionState = {
      mode: 'dragging',
      entryId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: off913,
      dateIndex: 0,
      targetDateIndex: 0,
      snappedTop: 913,
      previewTime: {
        start: new Date('2026-01-15T15:13:00'),
        end: new Date('2026-01-15T16:13:00'),
      },
      isOverlapping: false,
    };
    const { state } = dispatch(
      draggingState,
      { type: 'POINTER_MOVE', point: origin },
      createCtx({ snapIntervalMinutes: 5 }),
    );

    if (state.mode === 'dragging') {
      expect(state.snappedTop).toBe(915);
      expect(state.previewTime.start.getHours()).toBe(15);
      expect(state.previewTime.start.getMinutes()).toBe(15);
      expect(state.previewTime.end.getHours()).toBe(16);
      expect(state.previewTime.end.getMinutes()).toBe(15);
    }
  });

  it('5分snap設定ではdrag時にoff-grid durationも丸めて終了時刻をグリッドへ揃える', () => {
    const off913: EntryRect = { top: 913, left: 0, width: 200, height: 47 };
    const draggingState: InteractionState = {
      mode: 'dragging',
      entryId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: off913,
      dateIndex: 0,
      targetDateIndex: 0,
      snappedTop: 913,
      previewTime: {
        start: new Date('2026-01-15T15:13:00'),
        end: new Date('2026-01-15T16:00:00'),
      },
      isOverlapping: false,
    };
    const { state } = dispatch(
      draggingState,
      { type: 'POINTER_MOVE', point: origin },
      createCtx({
        snapIntervalMinutes: 5,
        getEntryDurationMs: () => 47 * 60 * 1000,
      }),
    );

    if (state.mode === 'dragging') {
      const durationMs = state.previewTime.end.getTime() - state.previewTime.start.getTime();
      expect(state.previewTime.start.getHours()).toBe(15);
      expect(state.previewTime.start.getMinutes()).toBe(15);
      expect(state.previewTime.end.getHours()).toBe(16);
      expect(state.previewTime.end.getMinutes()).toBe(0);
      expect(durationMs).toBe(45 * 60 * 1000);
    }
  });

  it('drag時は終了境界もsnapし、48分entryを不要に50分へ伸ばさない', () => {
    const off913: EntryRect = { top: 913, left: 0, width: 200, height: 48 };
    const draggingState: InteractionState = {
      mode: 'dragging',
      entryId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: off913,
      dateIndex: 0,
      targetDateIndex: 0,
      snappedTop: 913,
      previewTime: {
        start: new Date('2026-01-15T15:13:00'),
        end: new Date('2026-01-15T16:01:00'),
      },
      isOverlapping: false,
    };
    const { state } = dispatch(
      draggingState,
      { type: 'POINTER_MOVE', point: origin },
      createCtx({
        snapIntervalMinutes: 5,
        getEntryDurationMs: () => 48 * 60 * 1000,
      }),
    );

    if (state.mode === 'dragging') {
      const durationMs = state.previewTime.end.getTime() - state.previewTime.start.getTime();
      expect(state.previewTime.start.getHours()).toBe(15);
      expect(state.previewTime.start.getMinutes()).toBe(15);
      expect(state.previewTime.end.getHours()).toBe(16);
      expect(state.previewTime.end.getMinutes()).toBe(0);
      expect(durationMs).toBe(45 * 60 * 1000);
    }
  });

  it('RESIZE_START on 10:07 entry → preview range snaps to 10:00-11:00', () => {
    const { state } = dispatch(IDLE, {
      type: 'RESIZE_START',
      entryId: 'a',
      direction: 'bottom',
      point: origin,
      originalPosition: off607,
    });

    if (state.mode === 'resizing') {
      expect(state.previewTime.start.getHours()).toBe(10);
      expect(state.previewTime.start.getMinutes()).toBe(0);
      expect(state.previewTime.end.getHours()).toBe(11);
      expect(state.previewTime.end.getMinutes()).toBe(0);
    }
  });

  it('resize 10:07-11:07 entry を +15px → 10:00-11:15', () => {
    const resizingState: InteractionState = {
      mode: 'resizing',
      entryId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: off607,
      direction: 'bottom',
      snappedHeight: 60,
      previewTime: {
        start: new Date('2026-01-15T10:07:00'),
        end: new Date('2026-01-15T11:07:00'),
      },
      isOverlapping: false,
    };
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 15 };
    const { state } = dispatch(resizingState, { type: 'POINTER_MOVE', point: movedPoint });

    if (state.mode === 'resizing') {
      expect(state.snappedHeight).toBe(75);
      expect(state.previewTime.start.getHours()).toBe(10);
      expect(state.previewTime.start.getMinutes()).toBe(0);
      expect(state.previewTime.end.getHours()).toBe(11);
      expect(state.previewTime.end.getMinutes()).toBe(15);
    }
  });
});

// ========================================
// Day-end boundary regression
// ========================================

describe('day-end boundary regression', () => {
  it('dragging a 1-hour entry to 23:00 keeps the end at next-day 00:00', () => {
    const draggingState: InteractionState = {
      mode: 'dragging',
      entryId: 'a',
      startPoint: origin,
      currentPoint: origin,
      originalPosition: { top: 1320, left: 0, width: 200, height: 60 },
      dateIndex: 0,
      targetDateIndex: 0,
      snappedTop: 1320,
      previewTime: {
        start: new Date('2026-01-15T22:00:00'),
        end: new Date('2026-01-15T23:00:00'),
      },
      isOverlapping: false,
    };
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 60 };
    const { state } = dispatch(draggingState, { type: 'POINTER_MOVE', point: movedPoint });

    if (state.mode === 'dragging') {
      expect(state.snappedTop).toBe(1380);
      expect(state.previewTime.start.getHours()).toBe(23);
      expect(state.previewTime.start.getMinutes()).toBe(0);
      expect(state.previewTime.end.getDate()).toBe(16);
      expect(state.previewTime.end.getHours()).toBe(0);
      expect(state.previewTime.end.getMinutes()).toBe(0);
      expect(state.previewTime.end.getTime() - state.previewTime.start.getTime()).toBe(
        60 * 60 * 1000,
      );
    }
  });

  it('RESIZE_START supports a 23:00-24:00 range instead of collapsing to one interval', () => {
    const { state } = dispatch(IDLE, {
      type: 'RESIZE_START',
      entryId: 'a',
      direction: 'bottom',
      point: origin,
      originalPosition: { top: 1380, left: 0, width: 200, height: 60 },
    });

    if (state.mode === 'resizing') {
      expect(state.snappedHeight).toBe(60);
      expect(state.previewTime.start.getHours()).toBe(23);
      expect(state.previewTime.end.getDate()).toBe(16);
      expect(state.previewTime.end.getHours()).toBe(0);
      expect(state.previewTime.end.getMinutes()).toBe(0);
    }
  });

  it('grid selection at 23:45 ends at next-day 00:00', () => {
    const { state } = dispatch(IDLE, {
      type: 'GRID_POINTER_DOWN',
      point: origin,
      dateIndex: 0,
      gridY: 1425,
    });

    if (state.mode === 'selecting') {
      expect(state.selectionRange.start.getHours()).toBe(23);
      expect(state.selectionRange.start.getMinutes()).toBe(45);
      expect(state.selectionRange.end.getDate()).toBe(16);
      expect(state.selectionRange.end.getHours()).toBe(0);
      expect(state.selectionRange.end.getMinutes()).toBe(0);
    }
  });
});

// ========================================
// Grid selection (GRID_POINTER_DOWN → POINTER_MOVE → POINTER_UP)
// ========================================

describe('Grid selection (mouse)', () => {
  it('GRID_POINTER_DOWN → selecting with initial 15-min range', () => {
    const { state } = dispatch(IDLE, {
      type: 'GRID_POINTER_DOWN',
      point: { clientX: 100, clientY: 300 },
      dateIndex: 0,
      gridY: 540, // 9:00
    });

    expect(state.mode).toBe('selecting');
    if (state.mode === 'selecting') {
      expect(state.dateIndex).toBe(0);
      expect(state.gridStartY).toBe(540);
      expect(state.selectionRange.start.getHours()).toBe(9);
      expect(state.selectionRange.start.getMinutes()).toBe(0);
      // Minimum 15-min selection
      expect(state.selectionRange.end.getHours()).toBe(9);
      expect(state.selectionRange.end.getMinutes()).toBe(15);
    }
  });

  it('POINTER_MOVE extends selection range', () => {
    const selectingState: InteractionState = {
      mode: 'selecting',
      startPoint: { clientX: 100, clientY: 300 },
      currentPoint: { clientX: 100, clientY: 300 },
      dateIndex: 0,
      gridStartY: 540, // 9:00
      selectionRange: {
        start: new Date('2026-01-15T09:00:00'),
        end: new Date('2026-01-15T09:15:00'),
      },
      isOverlapping: false,
    };

    // Move 60px down = 1 hour
    const { state } = dispatch(selectingState, {
      type: 'POINTER_MOVE',
      point: { clientX: 100, clientY: 360 },
    });

    if (state.mode === 'selecting') {
      expect(state.selectionRange.start.getHours()).toBe(9);
      expect(state.selectionRange.end.getHours()).toBe(10);
    }
  });

  it('POINTER_UP with movement → SELECT_COMPLETE', () => {
    const selectingState: InteractionState = {
      mode: 'selecting',
      startPoint: { clientX: 100, clientY: 300 },
      currentPoint: { clientX: 100, clientY: 380 }, // moved > 5px
      dateIndex: 0,
      gridStartY: 540,
      selectionRange: {
        start: new Date('2026-01-15T09:00:00'),
        end: new Date('2026-01-15T10:00:00'),
      },
      isOverlapping: false,
    };

    const { state, effects } = dispatch(selectingState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'SELECT_COMPLETE', dateIndex: 0 }),
    );
  });

  it('POINTER_UP without movement → no selection', () => {
    const selectingState: InteractionState = {
      mode: 'selecting',
      startPoint: { clientX: 100, clientY: 300 },
      currentPoint: { clientX: 100, clientY: 302 }, // moved < 5px
      dateIndex: 0,
      gridStartY: 540,
      selectionRange: {
        start: new Date('2026-01-15T09:00:00'),
        end: new Date('2026-01-15T09:15:00'),
      },
      isOverlapping: false,
    };

    const { state, effects } = dispatch(selectingState, { type: 'POINTER_UP' });

    expect(state.mode).toBe('idle');
    expect(effects).not.toContainEqual(expect.objectContaining({ type: 'SELECT_COMPLETE' }));
  });
});

// ========================================
// Grid selection (touch — long-press required)
// ========================================

describe('Grid selection (touch)', () => {
  it('GRID_TOUCH_START → selection-longpress-pending with timer', () => {
    const { state, effects } = dispatch(IDLE, {
      type: 'GRID_TOUCH_START',
      point: { clientX: 100, clientY: 300 },
      dateIndex: 0,
      gridY: 540,
    });

    expect(state.mode).toBe('selection-longpress-pending');
    expect(effects).toContainEqual({
      type: 'START_LONGPRESS_TIMER',
      delayMs: SELECTION_LONGPRESS_DELAY_MS,
    });
  });

  it('GRID_LONGPRESS_FIRED → selecting with haptic', () => {
    const pending: InteractionState = {
      mode: 'selection-longpress-pending',
      startPoint: { clientX: 100, clientY: 300 },
      dateIndex: 0,
      gridStartY: 540,
    };

    const { state, effects } = dispatch(pending, { type: 'GRID_LONGPRESS_FIRED' });

    expect(state.mode).toBe('selecting');
    expect(effects).toContainEqual({ type: 'HAPTIC', pattern: 'tap' });
  });

  it('POINTER_MOVE > threshold cancels selection-longpress-pending', () => {
    const pending: InteractionState = {
      mode: 'selection-longpress-pending',
      startPoint: { clientX: 100, clientY: 300 },
      dateIndex: 0,
      gridStartY: 540,
    };

    const { state, effects } = dispatch(pending, {
      type: 'POINTER_MOVE',
      point: { clientX: 100, clientY: 300 + TOUCH_SCROLL_THRESHOLD_PX + 1 },
    });

    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual({ type: 'CLEAR_LONGPRESS_TIMER' });
  });

  it('POINTER_UP from selection-longpress-pending clears timer', () => {
    const pending: InteractionState = {
      mode: 'selection-longpress-pending',
      startPoint: { clientX: 100, clientY: 300 },
      dateIndex: 0,
      gridStartY: 540,
    };

    const { state, effects } = dispatch(pending, { type: 'POINTER_UP' });
    expect(state.mode).toBe('idle');
    expect(effects).toContainEqual({ type: 'CLEAR_LONGPRESS_TIMER' });
  });
});

// ========================================
// CANCEL
// ========================================

describe('CANCEL', () => {
  it('returns to idle from any state', () => {
    const states: InteractionState[] = [
      {
        mode: 'pending',
        entryId: 'a',
        startPoint: origin,
        originalPosition: rect,
        dateIndex: 0,
      },
      {
        mode: 'longpress-pending',
        entryId: 'a',
        startPoint: origin,
        originalPosition: rect,
        dateIndex: 0,
      },
      {
        mode: 'dragging',
        entryId: 'a',
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
        isOverlapping: false,
      },
    ];

    for (const s of states) {
      const { state } = dispatch(s, { type: 'CANCEL' });
      expect(state.mode).toBe('idle');
    }
  });

  it('clears longpress timer from longpress-pending', () => {
    const { effects } = dispatch(
      {
        mode: 'longpress-pending',
        entryId: 'a',
        startPoint: origin,
        originalPosition: rect,
        dateIndex: 0,
      },
      { type: 'CANCEL' },
    );
    expect(effects).toContainEqual({ type: 'CLEAR_LONGPRESS_TIMER' });
  });

  it('ends drag store from dragging', () => {
    const { effects } = dispatch(
      {
        mode: 'dragging',
        entryId: 'a',
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
        isOverlapping: false,
      },
      { type: 'CANCEL' },
    );
    expect(effects).toContainEqual({ type: 'DRAG_STORE_END' });
  });
});

// ========================================
// Context: getEntryDurationMs
// ========================================

describe('Custom entry duration', () => {
  it('uses getEntryDurationMs for 30-minute event', () => {
    const ctx = createCtx({
      getEntryDurationMs: () => 30 * 60 * 1000, // 30 min
    });

    const pendingState: InteractionState = {
      mode: 'pending',
      entryId: 'short',
      startPoint: origin,
      originalPosition: { ...rect, top: 540 }, // 9:00
      dateIndex: 0,
    };

    // Move beyond threshold
    const movedPoint = { clientX: origin.clientX, clientY: origin.clientY + 10 };
    const { state } = dispatch(pendingState, { type: 'POINTER_MOVE', point: movedPoint }, ctx);

    if (state.mode === 'dragging') {
      const durationMs = state.previewTime.end.getTime() - state.previewTime.start.getTime();
      expect(durationMs).toBe(30 * 60 * 1000);
    }
  });
});

// ========================================
// Edge case: upward selection (drag up)
// ========================================

describe('Upward selection', () => {
  it('ignores upward drag and keeps start time fixed', () => {
    const selectingState: InteractionState = {
      mode: 'selecting',
      startPoint: { clientX: 100, clientY: 400 },
      currentPoint: { clientX: 100, clientY: 400 },
      dateIndex: 0,
      gridStartY: 600, // 10:00
      selectionRange: {
        start: new Date('2026-01-15T10:00:00'),
        end: new Date('2026-01-15T10:15:00'),
      },
      isOverlapping: false,
    };

    // Move up 60px (1 hour) — downward-only なので開始時刻は固定
    const { state } = dispatch(selectingState, {
      type: 'POINTER_MOVE',
      point: { clientX: 100, clientY: 340 },
    });

    if (state.mode === 'selecting') {
      // 上方向ドラッグは無視: 10:00 → 10:15（最低1スロット）
      expect(state.selectionRange.start.getHours()).toBe(10);
      expect(state.selectionRange.start.getMinutes()).toBe(0);
      expect(state.selectionRange.end.getHours()).toBe(10);
      expect(state.selectionRange.end.getMinutes()).toBe(15);
    }
  });
});

// ========================================
// POINTER_MOVE in idle (no-op)
// ========================================

describe('POINTER_MOVE in idle', () => {
  it('stays idle (no-op)', () => {
    const { state, effects } = dispatch(IDLE, {
      type: 'POINTER_MOVE',
      point: { clientX: 300, clientY: 400 },
    });
    expect(state.mode).toBe('idle');
    expect(effects).toHaveLength(0);
  });
});
