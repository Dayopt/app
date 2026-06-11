import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../types/calendar.types';
import { hasCalendarActualRangeDiff } from '../entry-time';

function makeEntry(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = new Date('2026-06-10T08:00:00.000Z');
  const end = new Date('2026-06-10T09:00:00.000Z');
  return {
    id: 'entry-1',
    title: 'entry',
    startDate: start,
    endDate: end,
    displayStartDate: start,
    displayEndDate: end,
    plannedStartDate: start,
    plannedEndDate: end,
    actualStartDate: start,
    actualEndDate: end,
    status: 'open',
    color: 'blue',
    createdAt: start,
    updatedAt: start,
    duration: 60,
    isMultiDay: false,
    origin: 'planned',
    ...overrides,
  };
}

describe('hasCalendarActualRangeDiff', () => {
  it('予定と記録が一致する通常 entry は false', () => {
    expect(hasCalendarActualRangeDiff(makeEntry())).toBe(false);
  });

  it('記録が予定を超過している entry は true', () => {
    expect(
      hasCalendarActualRangeDiff(
        makeEntry({ actualEndDate: new Date('2026-06-10T09:10:00.000Z') }),
      ),
    ).toBe(true);
  });

  it('actual がない予定だけ entry は true', () => {
    expect(
      hasCalendarActualRangeDiff(makeEntry({ actualStartDate: null, actualEndDate: null })),
    ).toBe(true);
  });
});
