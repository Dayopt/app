import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimeblockRect } from '../../domain/interaction/types';
import { useCalendarDragStore } from '../../stores/useCalendarDragStore';
import type { CalendarEvent } from '../../types/calendar.types';
import { useInteraction, type UseInteractionProps } from '../useInteraction';

const baseEvent: CalendarEvent = {
  id: 'entry-1',
  title: 'test entry',
  startDate: new Date('2026-01-15T09:00:00'),
  endDate: new Date('2026-01-15T10:00:00'),
  tagId: null,
  origin: 'manual',
  actualStartDate: null,
  actualEndDate: null,
  kind: 'plan',
} as unknown as CalendarEvent;

const rect: TimeblockRect = { top: 540, left: 0, width: 200, height: 60 };
const now = new Date('2026-01-15T12:00:00').getTime();

function createMouseEvent(clientX: number = 100, clientY: number = 540): React.MouseEvent {
  return {
    button: 0,
    preventDefault: () => {},
    stopPropagation: () => {},
    nativeEvent: { clientX, clientY },
  } as unknown as React.MouseEvent;
}

function makeProps(overrides: Partial<UseInteractionProps> = {}): UseInteractionProps {
  return {
    date: new Date('2026-01-15T00:00:00'),
    events: [baseEvent],
    hourHeight: 60,
    viewMode: 'day',
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  useCalendarDragStore.getState().endDrag();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll('[data-calendar-day-index]').forEach((element) => element.remove());
});

function completeDrag(hook: { result: { current: ReturnType<typeof useInteraction> } }) {
  act(() => {
    hook.result.current.dispatch({
      type: 'POINTER_DOWN',
      timeblockId: 'entry-1',
      point: { clientX: 20, clientY: 540 },
      originalPosition: rect,
      dateIndex: 0,
    });
    hook.result.current.dispatch({
      type: 'POINTER_MOVE',
      point: { clientX: 80, clientY: 570 },
    });
  });
}

function createDayColumn(): HTMLElement {
  const column = document.createElement('div');
  column.dataset.calendarDayIndex = '0';
  column.getBoundingClientRect = () =>
    ({
      bottom: 1440,
      height: 1440,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(column);
  return column;
}

function dropIntoRecordLane(
  hook: { result: { current: ReturnType<typeof useInteraction> } },
  moveY: number = 570,
): void {
  act(() => {
    hook.result.current.dispatch({
      type: 'POINTER_DOWN',
      timeblockId: 'entry-1',
      point: { clientX: 20, clientY: 540 },
      originalPosition: rect,
      dateIndex: 0,
    });
    hook.result.current.dispatch({
      type: 'POINTER_MOVE',
      point: { clientX: 180, clientY: moveY },
    });
    useCalendarDragStore.getState().updateDrag({ targetLane: 'record' });
    hook.result.current.dispatch({ type: 'POINTER_UP' });
  });
}

describe('useInteraction Plan → Record drop', () => {
  it('Recordレーンへのdropはplan更新ではなく記録mutationへ委譲する', () => {
    const onEventUpdate = vi.fn();
    const onPlanRecord = vi.fn();
    const hook = renderHook(() => useInteraction(makeProps({ onEventUpdate, onPlanRecord })));

    completeDrag(hook);
    act(() => {
      useCalendarDragStore.getState().updateDrag({ targetLane: 'record' });
      hook.result.current.dispatch({ type: 'POINTER_UP' });
    });

    expect(onPlanRecord).toHaveBeenCalledWith('entry-1', {
      start: new Date('2026-01-15T09:30:00'),
      end: new Date('2026-01-15T10:30:00'),
    });
    expect(onEventUpdate).not.toHaveBeenCalled();
  });

  it('最初のmousemoveでRecordレーンへ入った場合もtarget laneとpreview rangeを保持する', () => {
    createDayColumn();
    const onPlanRecord = vi.fn();
    const hook = renderHook(() => useInteraction(makeProps({ onPlanRecord })));

    act(() => {
      hook.result.current.dispatch({
        type: 'POINTER_DOWN',
        timeblockId: 'entry-1',
        point: { clientX: 20, clientY: 540 },
        originalPosition: rect,
        dateIndex: 0,
      });
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 570 }));
    });

    expect(hook.result.current.state.mode).toBe('dragging');
    expect(useCalendarDragStore.getState().targetLane).toBe('record');

    act(() => hook.result.current.dispatch({ type: 'POINTER_UP' }));

    expect(onPlanRecord).toHaveBeenCalledWith('entry-1', {
      start: new Date('2026-01-15T09:30:00'),
      end: new Date('2026-01-15T10:30:00'),
    });
  });

  it('連続dragでは前回のRecord targetを引き継がず最初のmousemoveでPlan laneへ戻る', () => {
    createDayColumn();
    const onPlanRecord = vi.fn();
    const hook = renderHook(() => useInteraction(makeProps({ onPlanRecord })));

    act(() => {
      hook.result.current.handlers.handlePointerDown('entry-1', createMouseEvent(20, 540), rect);
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 570 }));
    });
    act(() => hook.result.current.dispatch({ type: 'POINTER_UP' }));

    expect(onPlanRecord).toHaveBeenCalledTimes(1);

    act(() => {
      hook.result.current.handlers.handlePointerDown('entry-1', createMouseEvent(20, 540), rect);
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 600 }));
    });

    expect(useCalendarDragStore.getState().targetLane).toBe('plan');

    act(() => hook.result.current.dispatch({ type: 'POINTER_UP' }));

    expect(onPlanRecord).toHaveBeenCalledTimes(1);
  });

  it('タグフィルターで非表示のRecordとも重複を検出してdropを拒否する', () => {
    createDayColumn();
    const onPlanRecord = vi.fn();
    const record = {
      ...baseEvent,
      id: 'record-1',
      kind: 'record' as const,
      origin: 'unplanned' as const,
      startDate: new Date('2026-01-15T09:15:00'),
      endDate: new Date('2026-01-15T10:45:00'),
    };
    const hook = renderHook(() =>
      useInteraction(
        makeProps({
          events: [baseEvent],
          allEventsForOverlapCheck: [baseEvent, record],
          onPlanRecord,
        }),
      ),
    );

    act(() => {
      hook.result.current.dispatch({
        type: 'POINTER_DOWN',
        timeblockId: 'entry-1',
        point: { clientX: 20, clientY: 540 },
        originalPosition: rect,
        dateIndex: 0,
      });
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 570 }));
    });

    expect(hook.result.current.state).toMatchObject({ mode: 'dragging', isOverlapping: true });

    act(() => hook.result.current.dispatch({ type: 'POINTER_UP' }));

    expect(onPlanRecord).not.toHaveBeenCalled();
  });

  it.each([
    [
      'active Plan',
      {
        ...baseEvent,
        startDate: new Date('2026-01-15T11:00:00'),
        endDate: new Date('2026-01-15T13:00:00'),
      },
    ],
    [
      'future Plan',
      {
        ...baseEvent,
        startDate: new Date('2026-01-16T09:00:00'),
        endDate: new Date('2026-01-16T10:00:00'),
      },
    ],
    ['skipped Plan', { ...baseEvent, isSkipped: true }],
  ])('%sはRecordレーンへdropしても記録callbackを呼ばない', (_label, event) => {
    const onEventUpdate = vi.fn();
    const onPlanRecord = vi.fn();
    const hook = renderHook(() =>
      useInteraction(makeProps({ events: [event], onEventUpdate, onPlanRecord })),
    );

    dropIntoRecordLane(hook);

    expect(onPlanRecord).not.toHaveBeenCalled();
    expect(onEventUpdate).not.toHaveBeenCalled();
  });

  it('drop previewの終了が未来なら過去Planでも記録callbackを呼ばない', () => {
    const onEventUpdate = vi.fn();
    const onPlanRecord = vi.fn();
    const hook = renderHook(() => useInteraction(makeProps({ onEventUpdate, onPlanRecord })));

    dropIntoRecordLane(hook, 720);

    expect(onPlanRecord).not.toHaveBeenCalled();
    expect(onEventUpdate).not.toHaveBeenCalled();
  });

  it('過去Planの同一レーンdropは時間更新しない', () => {
    const onEventUpdate = vi.fn();
    const pastPlan = {
      ...baseEvent,
      startDate: new Date('2020-01-15T09:00:00'),
      endDate: new Date('2020-01-15T10:00:00'),
    };
    const hook = renderHook(() => useInteraction(makeProps({ events: [pastPlan], onEventUpdate })));

    completeDrag(hook);
    act(() => {
      hook.result.current.dispatch({ type: 'POINTER_UP' });
    });

    expect(onEventUpdate).not.toHaveBeenCalled();
  });
});

describe('useInteraction handleResizeStart guard', () => {
  it('PC + Inspector open: disabledPlanId と resizeDisabledPlanId が同じ ID のとき RESIZE_START を block', () => {
    const { result } = renderHook(() =>
      useInteraction(
        makeProps({
          disabledPlanId: 'entry-1',
          resizeDisabledPlanId: 'entry-1',
        }),
      ),
    );

    expect(result.current.state.mode).toBe('idle');

    act(() => {
      result.current.handlers.handleResizeStart('entry-1', 'bottom', createMouseEvent(), rect);
    });

    expect(result.current.state.mode).toBe('idle');
  });

  it('Mobile + Inspector open: resizeDisabledPlanId が null のとき RESIZE_START が dispatch される', () => {
    const { result } = renderHook(() =>
      useInteraction(
        makeProps({
          disabledPlanId: 'entry-1',
          resizeDisabledPlanId: null,
        }),
      ),
    );

    act(() => {
      result.current.handlers.handleResizeStart('entry-1', 'bottom', createMouseEvent(), rect);
    });

    expect(result.current.state.mode).toBe('resizing');
  });

  it('Inspector closed: 両 prop が null/undefined のとき RESIZE_START が dispatch される', () => {
    const { result } = renderHook(() => useInteraction(makeProps()));

    act(() => {
      result.current.handlers.handleResizeStart('entry-1', 'bottom', createMouseEvent(), rect);
    });

    expect(result.current.state.mode).toBe('resizing');
  });

  it('別 entry 対象: resizeDisabledPlanId が別 ID のとき RESIZE_START が dispatch される', () => {
    const { result } = renderHook(() =>
      useInteraction(
        makeProps({
          disabledPlanId: 'entry-other',
          resizeDisabledPlanId: 'entry-other',
        }),
      ),
    );

    act(() => {
      result.current.handlers.handleResizeStart('entry-1', 'bottom', createMouseEvent(), rect);
    });

    expect(result.current.state.mode).toBe('resizing');
  });
});

describe('useInteraction resize completion', () => {
  it('通常 entry の resize 完了時は actual 固定フラグを渡さない', () => {
    const onEventUpdate = vi.fn();
    const matchingEntry: CalendarEvent = {
      ...baseEvent,
      origin: 'planned',
      plannedStartDate: baseEvent.startDate,
      plannedEndDate: baseEvent.endDate,
      actualStartDate: baseEvent.startDate,
      actualEndDate: baseEvent.endDate,
    };
    const { result } = renderHook(() =>
      useInteraction(makeProps({ events: [matchingEntry], onEventUpdate })),
    );

    act(() => {
      result.current.dispatch({
        type: 'RESIZE_START',
        timeblockId: 'entry-1',
        direction: 'bottom',
        point: { clientX: 100, clientY: 600 },
        originalPosition: rect,
      });
    });
    act(() => {
      result.current.dispatch({
        type: 'POINTER_MOVE',
        point: { clientX: 100, clientY: 615 },
      });
    });
    act(() => {
      result.current.dispatch({ type: 'POINTER_UP' });
    });

    expect(onEventUpdate).toHaveBeenCalledWith(
      'entry-1',
      expect.not.objectContaining({ keepActualTime: true }),
    );
  });

  it('予定と記録がズレた entry の resize 完了時も actual 固定フラグは渡さない（自動記録モデルでは planned のみ更新）', () => {
    const onEventUpdate = vi.fn();
    const overtimeEntry: CalendarEvent = {
      ...baseEvent,
      origin: 'planned',
      plannedStartDate: baseEvent.startDate,
      plannedEndDate: baseEvent.endDate,
      actualStartDate: baseEvent.startDate,
      actualEndDate: new Date('2026-01-15T10:10:00'),
    };
    const { result } = renderHook(() =>
      useInteraction(makeProps({ events: [overtimeEntry], onEventUpdate })),
    );

    act(() => {
      result.current.dispatch({
        type: 'RESIZE_START',
        timeblockId: 'entry-1',
        direction: 'bottom',
        point: { clientX: 100, clientY: 600 },
        originalPosition: rect,
      });
      result.current.dispatch({
        type: 'POINTER_MOVE',
        point: { clientX: 100, clientY: 615 },
      });
      result.current.dispatch({ type: 'POINTER_UP' });
    });

    expect(onEventUpdate).toHaveBeenCalledWith(
      'entry-1',
      expect.not.objectContaining({ keepActualTime: true }),
    );
  });
});

describe('useInteraction selection completion', () => {
  it('passes day-end selection as 24:00 instead of next-day 0:00', () => {
    let selection: {
      date: Date;
      startHour: number;
      startMinute: number;
      endHour: number;
      endMinute: number;
    } | null = null;
    const { result } = renderHook(() =>
      useInteraction(
        makeProps({
          onTimeRangeSelect: (next) => {
            selection = next;
          },
        }),
      ),
    );

    act(() => {
      result.current.dispatch({
        type: 'GRID_POINTER_DOWN',
        point: { clientX: 100, clientY: 1425 },
        dateIndex: 0,
        gridY: 1425,
      });
      result.current.dispatch({
        type: 'POINTER_MOVE',
        point: { clientX: 100, clientY: 1445 },
      });
      result.current.dispatch({ type: 'POINTER_UP' });
    });

    expect(selection).toMatchObject({
      startHour: 23,
      startMinute: 45,
      endHour: 24,
      endMinute: 0,
    });
  });
});
