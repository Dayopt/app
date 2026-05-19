import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../../../types/calendar.types';
import { useWeekEntries } from '../hooks/useWeekEntries';

const createMockEntry = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `entry-${Math.random().toString(36).slice(2)}`,
  title: 'Test Entry',
  startDate: new Date('2026-03-30T10:00:00'),
  endDate: new Date('2026-03-30T11:00:00'),
  displayStartDate: new Date('2026-03-30T10:00:00'),
  displayEndDate: new Date('2026-03-30T11:00:00'),
  status: 'open',
  color: 'blue',
  duration: 60,
  isMultiDay: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// 2026-03-30(月)〜04-05(日) の週
const weekDates = Array.from({ length: 7 }, (_, i) => {
  const d = new Date('2026-03-30');
  d.setDate(d.getDate() + i);
  return d;
});

describe('useWeekEntries', () => {
  it('エントリがない場合は空のpositionsを返す', () => {
    const { result } = renderHook(() => useWeekEntries({ weekDates, events: [], timezone: 'UTC' }));

    expect(result.current.entryPositions).toEqual([]);
    expect(result.current.maxConcurrentEntries).toBe(0);
  });

  it('エントリを日付ごとにグループ化する', () => {
    const mondayEntry = createMockEntry({
      id: 'monday',
      startDate: new Date('2026-03-30T09:00:00'),
      endDate: new Date('2026-03-30T10:00:00'),
      displayStartDate: new Date('2026-03-30T09:00:00'),
      displayEndDate: new Date('2026-03-30T10:00:00'),
    });
    const wednesdayEntry = createMockEntry({
      id: 'wednesday',
      startDate: new Date('2026-04-01T14:00:00'),
      endDate: new Date('2026-04-01T15:00:00'),
      displayStartDate: new Date('2026-04-01T14:00:00'),
      displayEndDate: new Date('2026-04-01T15:00:00'),
    });

    const { result } = renderHook(() =>
      useWeekEntries({
        weekDates,
        events: [mondayEntry, wednesdayEntry],
        timezone: 'UTC',
      }),
    );

    expect(result.current.entryPositions).toHaveLength(2);
    // 月曜 = dayIndex 0, 水曜 = dayIndex 2
    const mondayPos = result.current.entryPositions.find((p) => p.plan.id === 'monday');
    const wedPos = result.current.entryPositions.find((p) => p.plan.id === 'wednesday');
    expect(mondayPos?.dayIndex).toBe(0);
    expect(wedPos?.dayIndex).toBe(2);
  });

  it('週の範囲外のエントリは除外される', () => {
    const outsideEntry = createMockEntry({
      id: 'outside',
      startDate: new Date('2026-04-10T10:00:00'),
      endDate: new Date('2026-04-10T11:00:00'),
      displayStartDate: new Date('2026-04-10T10:00:00'),
      displayEndDate: new Date('2026-04-10T11:00:00'),
    });

    const { result } = renderHook(() =>
      useWeekEntries({
        weekDates,
        events: [outsideEntry],
        timezone: 'UTC',
      }),
    );

    expect(result.current.entryPositions).toHaveLength(0);
  });

  it('同日の重複エントリで正しい位置が計算される', () => {
    const entry1 = createMockEntry({
      id: 'e1',
      startDate: new Date('2026-03-30T10:00:00'),
      endDate: new Date('2026-03-30T11:00:00'),
      displayStartDate: new Date('2026-03-30T10:00:00'),
      displayEndDate: new Date('2026-03-30T11:00:00'),
    });
    const entry2 = createMockEntry({
      id: 'e2',
      startDate: new Date('2026-03-30T10:30:00'),
      endDate: new Date('2026-03-30T11:30:00'),
      displayStartDate: new Date('2026-03-30T10:30:00'),
      displayEndDate: new Date('2026-03-30T11:30:00'),
    });

    const { result } = renderHook(() =>
      useWeekEntries({
        weekDates,
        events: [entry1, entry2],
        timezone: 'UTC',
      }),
    );

    expect(result.current.entryPositions).toHaveLength(2);
    expect(result.current.maxConcurrentEntries).toBe(2);
  });
});
