import { describe, expect, it } from 'vitest';

import { hasTwoLayerTimeConflict } from '@/lib/time/two-layer-overlap';

import type { CalendarEvent } from '../../types/calendar.types';

import {
  buildInteractionOverlapTarget,
  buildNewEntryOverlapTarget,
  checkClientSideOverlap,
} from '../overlap';

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

describe('buildNewEntryOverlapTarget', () => {
  it('未来の新規予定はplanned/actualに同じ範囲を入れる', () => {
    const start = new Date('2030-01-15T10:00');
    const end = new Date('2030-01-15T11:00');
    const target = buildNewEntryOverlapTarget(start, end, new Date('2026-01-15T09:00').getTime());

    expect(target).toMatchObject({
      id: '',
      plannedStart: start,
      plannedEnd: end,
      actualStart: start,
      actualEnd: end,
    });
    expect(hasTwoLayerTimeConflict([], target)).toBe(false);
  });

  it('過去の新規記録はplannedなし、actualありにする', () => {
    const start = new Date('2026-01-15T10:00');
    const end = new Date('2026-01-15T11:00');
    const target = buildNewEntryOverlapTarget(start, end, new Date('2026-01-15T12:00').getTime());

    expect(target).toMatchObject({
      id: '',
      plannedStart: null,
      plannedEnd: null,
      actualStart: start,
      actualEnd: end,
    });
    expect(hasTwoLayerTimeConflict([], target)).toBe(false);
  });
});

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

  it('未来の新規作成は空き枠ならfalse', () => {
    expect(
      checkClientSideOverlap([], '', new Date('2030-01-15T10:00'), new Date('2030-01-15T11:00')),
    ).toBe(false);
  });

  it('未来の新規作成は既存予定の終端に接していてもfalse', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2030-01-15T09:00'),
        endDate: new Date('2030-01-15T10:00'),
        plannedStartDate: new Date('2030-01-15T09:00'),
        plannedEndDate: new Date('2030-01-15T10:00'),
        actualStartDate: new Date('2030-01-15T09:00'),
        actualEndDate: new Date('2030-01-15T10:00'),
        origin: 'planned',
      }),
    ];

    expect(
      checkClientSideOverlap(
        events,
        '',
        new Date('2030-01-15T10:00'),
        new Date('2030-01-15T11:00'),
      ),
    ).toBe(false);
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

  it('過去の新規作成はplanned前半gap内ならactual重複がなければ許可する', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        plannedStartDate: new Date('2026-01-15T10:00'),
        plannedEndDate: new Date('2026-01-15T11:00'),
        actualStartDate: new Date('2026-01-15T10:30'),
        actualEndDate: new Date('2026-01-15T11:00'),
        origin: 'planned',
      }),
    ];

    expect(
      checkClientSideOverlap(
        events,
        '',
        new Date('2026-01-15T10:00'),
        new Date('2026-01-15T10:30'),
      ),
    ).toBe(false);
  });

  it('過去の新規作成でもactual範囲に重なる場合は衝突にする', () => {
    const events = [
      createEvent({
        id: 'a',
        startDate: new Date('2026-01-15T10:00'),
        endDate: new Date('2026-01-15T11:00'),
        plannedStartDate: new Date('2026-01-15T10:00'),
        plannedEndDate: new Date('2026-01-15T11:00'),
        actualStartDate: new Date('2026-01-15T10:30'),
        actualEndDate: new Date('2026-01-15T11:00'),
        origin: 'planned',
      }),
    ];

    expect(
      checkClientSideOverlap(
        events,
        '',
        new Date('2026-01-15T10:15'),
        new Date('2026-01-15T10:45'),
      ),
    ).toBe(true);
  });

  it('ズレた planned の drag は actual も平行移動した範囲で衝突判定する', () => {
    const dragged = createEvent({
      id: 'dragged',
      startDate: new Date('2026-01-15T13:00'),
      endDate: new Date('2026-01-15T15:00'),
      plannedStartDate: new Date('2026-01-15T13:00'),
      plannedEndDate: new Date('2026-01-15T15:00'),
      actualStartDate: new Date('2026-01-15T13:30'),
      actualEndDate: new Date('2026-01-15T16:45'),
    });
    const blocker = createEvent({
      id: 'blocker',
      startDate: new Date('2026-01-15T19:00'),
      endDate: new Date('2026-01-15T20:00'),
      plannedStartDate: new Date('2026-01-15T19:00'),
      plannedEndDate: new Date('2026-01-15T20:00'),
      actualStartDate: new Date('2026-01-15T17:30'),
      actualEndDate: new Date('2026-01-15T18:00'),
    });

    expect(
      checkClientSideOverlap(
        [dragged, blocker],
        dragged.id,
        new Date('2026-01-15T15:00'),
        new Date('2026-01-15T17:00'),
        'drag',
      ),
    ).toBe(true);
  });

  it('ズレた planned の resize は固定actual範囲で衝突判定する', () => {
    const resized = createEvent({
      id: 'resized',
      startDate: new Date('2026-01-15T13:00'),
      endDate: new Date('2026-01-15T15:00'),
      plannedStartDate: new Date('2026-01-15T13:00'),
      plannedEndDate: new Date('2026-01-15T15:00'),
      actualStartDate: new Date('2026-01-15T13:30'),
      actualEndDate: new Date('2026-01-15T16:45'),
    });
    const blocker = createEvent({
      id: 'blocker',
      startDate: new Date('2026-01-15T18:00'),
      endDate: new Date('2026-01-15T19:00'),
      plannedStartDate: new Date('2026-01-15T18:00'),
      plannedEndDate: new Date('2026-01-15T19:00'),
      actualStartDate: new Date('2026-01-15T16:30'),
      actualEndDate: new Date('2026-01-15T17:00'),
    });

    expect(
      checkClientSideOverlap(
        [resized, blocker],
        resized.id,
        new Date('2026-01-15T13:00'),
        new Date('2026-01-15T15:15'),
        'resize',
      ),
    ).toBe(true);
  });

  it('resize後のplannedだけが他entryのactualと交差しても衝突にしない', () => {
    const resized = createEvent({
      id: 'resized',
      startDate: new Date('2026-01-15T13:00'),
      endDate: new Date('2026-01-15T15:00'),
      plannedStartDate: new Date('2026-01-15T13:00'),
      plannedEndDate: new Date('2026-01-15T15:00'),
      actualStartDate: new Date('2026-01-15T13:30'),
      actualEndDate: new Date('2026-01-15T14:30'),
    });
    const other = createEvent({
      id: 'other',
      startDate: new Date('2026-01-15T18:00'),
      endDate: new Date('2026-01-15T19:00'),
      plannedStartDate: new Date('2026-01-15T18:00'),
      plannedEndDate: new Date('2026-01-15T19:00'),
      actualStartDate: new Date('2026-01-15T15:00'),
      actualEndDate: new Date('2026-01-15T15:30'),
    });

    expect(
      checkClientSideOverlap(
        [resized, other],
        resized.id,
        new Date('2026-01-15T13:00'),
        new Date('2026-01-15T16:00'),
        'resize',
      ),
    ).toBe(false);
  });
});

describe('buildInteractionOverlapTarget', () => {
  it('planned-only の操作targetはactualを持たない', () => {
    const entry = createEvent({
      id: 'planned-only',
      startDate: new Date('2026-01-15T10:00'),
      endDate: new Date('2026-01-15T11:00'),
      actualStartDate: null,
      actualEndDate: null,
    });

    expect(
      buildInteractionOverlapTarget(
        entry,
        new Date('2026-01-15T12:00'),
        new Date('2026-01-15T13:00'),
        'drag',
      ),
    ).toMatchObject({
      plannedStart: new Date('2026-01-15T12:00'),
      plannedEnd: new Date('2026-01-15T13:00'),
      actualStart: null,
      actualEnd: null,
      allowMissingActual: true,
    });
  });
});
