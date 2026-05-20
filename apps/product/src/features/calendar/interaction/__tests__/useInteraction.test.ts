import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
