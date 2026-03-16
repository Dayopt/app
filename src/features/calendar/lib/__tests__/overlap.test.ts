import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../types/calendar.types';

import { checkClientSideOverlap } from '../overlap';

function createEvent(
  overrides: Partial<CalendarEvent> & { id: string; startDate: Date; endDate: Date },
): CalendarEvent {
  return {
    title: 'Test',
    displayStartDate: overrides.startDate,
    displayEndDate: overrides.endDate,
    duration: 60,
    isMultiDay: false,
    isRecurring: false,
    status: 'open',
    color: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    origin: 'planned',
    ...overrides,
  } as CalendarEvent;
}

describe('checkClientSideOverlap', () => {
  it('Plan↔Plan の重複はtrue', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        origin: 'planned',
      }),
      createEvent({
        id: 'b',
        startDate: new Date('2026-01-15T10:30'),
        endDate: new Date('2026-01-15T11:30'),
        origin: 'planned',
      }),
    ];
    expect(
      checkClientSideOverlap(
        events,
        'a',
        new Date('2026-01-15T10:00'),
        new Date('2026-01-15T11:00'),
      ),
    ).toBe(true);
  });

  it('Record↔Record の重複はtrue', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        origin: 'unplanned',
      }),
      createEvent({
        id: 'b',
        startDate: new Date('2026-01-15T10:30'),
        endDate: new Date('2026-01-15T11:30'),
        origin: 'unplanned',
      }),
    ];
    expect(
      checkClientSideOverlap(
        events,
        'a',
        new Date('2026-01-15T10:00'),
        new Date('2026-01-15T11:00'),
      ),
    ).toBe(true);
  });

  it('Plan↔Record の重複はfalse（共存可能）', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        origin: 'planned',
      }),
      createEvent({
        id: 'b',
        startDate: new Date('2026-01-15T10:30'),
        endDate: new Date('2026-01-15T11:30'),
        origin: 'unplanned',
      }),
    ];
    expect(
      checkClientSideOverlap(
        events,
        'a',
        new Date('2026-01-15T10:00'),
        new Date('2026-01-15T11:00'),
      ),
    ).toBe(false);
  });

  it('自分自身との重複は除外', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        origin: 'planned',
      }),
    ];
    expect(
      checkClientSideOverlap(
        events,
        'a',
        new Date('2026-01-15T10:00'),
        new Date('2026-01-15T11:00'),
      ),
    ).toBe(false);
  });

  it('時間が離れていればfalse', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        origin: 'planned',
      }),
      createEvent({
        id: 'b',
        startDate: new Date('2026-01-15T14:00'),
        endDate: new Date('2026-01-15T15:00'),
        origin: 'planned',
      }),
    ];
    expect(
      checkClientSideOverlap(
        events,
        'a',
        new Date('2026-01-15T10:00'),
        new Date('2026-01-15T11:00'),
      ),
    ).toBe(false);
  });

  it('ドラッグ中のイベントが見つからない場合はfalse', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
      }),
    ];
    expect(
      checkClientSideOverlap(
        events,
        'nonexistent',
        new Date('2026-01-15T10:00'),
        new Date('2026-01-15T11:00'),
      ),
    ).toBe(false);
  });
});
