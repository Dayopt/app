import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { EntryRect } from '../../domain/interaction/types';
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
} as unknown as CalendarEvent;

const rect: EntryRect = { top: 540, left: 0, width: 200, height: 60 };

function createMouseEvent(): React.MouseEvent {
  return {
    button: 0,
    preventDefault: () => {},
    stopPropagation: () => {},
    nativeEvent: { clientX: 100, clientY: 540 },
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
  it('resize 完了時は actual 固定フラグを渡す', () => {
    const onEventUpdate = vi.fn();
    const { result } = renderHook(() => useInteraction(makeProps({ onEventUpdate })));

    act(() => {
      result.current.dispatch({
        type: 'RESIZE_START',
        entryId: 'entry-1',
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
      expect.objectContaining({ keepActualTime: true }),
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
