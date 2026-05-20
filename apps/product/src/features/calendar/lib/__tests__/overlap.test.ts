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

  it('重複するイベントはtrue（origin区別なし）', () => {
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

  it('ドラッグ中でないイベントとの重複はtrue', () => {
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
    ).toBe(true);
  });

  it('未来の新規作成はplanned range同士の重複を見る', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2030-01-15T10:00'),
        endDate: new Date('2030-01-15T11:00'),
        plannedStartDate: new Date('2030-01-15T10:00'),
        plannedEndDate: new Date('2030-01-15T11:00'),
        actualStartDate: new Date('2030-01-15T12:00'),
        actualEndDate: new Date('2030-01-15T13:00'),
        origin: 'planned',
      }),
    ];

    expect(
      checkClientSideOverlap(
        events,
        '',
        new Date('2030-01-15T10:30'),
        new Date('2030-01-15T10:45'),
      ),
    ).toBe(true);
  });

  it('過去の新規作成はplanned gap内ならactual重複がなければ許可する', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        plannedStartDate: new Date('2026-01-15T10:00'),
        plannedEndDate: new Date('2026-01-15T11:00'),
        actualStartDate: new Date('2026-01-15T10:00'),
        actualEndDate: new Date('2026-01-15T10:30'),
        origin: 'planned',
      }),
    ];

    expect(
      checkClientSideOverlap(
        events,
        '',
        new Date('2026-01-15T10:30'),
        new Date('2026-01-15T11:00'),
      ),
    ).toBe(false);
  });
});
