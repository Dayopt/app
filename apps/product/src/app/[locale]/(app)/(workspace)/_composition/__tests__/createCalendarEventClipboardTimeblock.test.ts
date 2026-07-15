import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@/features/calendar';

import { createCalendarEventClipboardTimeblock } from '../createCalendarEventClipboardTimeblock';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'plan-1',
    title: '読書',
    description: '第3章まで',
    startDate: new Date('2026-07-14T00:15:00.000Z'),
    endDate: new Date('2026-07-14T01:45:00.000Z'),
    status: 'open',
    color: 'blue',
    tagId: 'tag-reading',
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    displayStartDate: new Date(2026, 6, 14, 9, 15),
    displayEndDate: new Date(2026, 6, 14, 10, 45),
    duration: 90,
    isMultiDay: false,
    kind: 'plan',
    ...overrides,
  };
}

describe('createCalendarEventClipboardTimeblock', () => {
  it('DBのUTC時刻ではなくCalendarのwall-clock時刻をコピーする', () => {
    expect(createCalendarEventClipboardTimeblock(makeEvent())).toEqual({
      kind: 'plan',
      title: '読書',
      description: '第3章まで',
      duration: 90,
      startHour: 9,
      startMinute: 15,
      tagId: 'tag-reading',
    });
  });

  it('種別を持たないCalendarEventはコピー対象にしない', () => {
    expect(createCalendarEventClipboardTimeblock(makeEvent({ kind: undefined }))).toBeNull();
  });
});
