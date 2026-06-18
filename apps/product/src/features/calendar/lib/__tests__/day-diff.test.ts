import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../types/calendar.types';
import { computeCalendarDayDiffs } from '../day-diff';

const now = new Date('2026-06-18T23:00:00.000Z');

function entry(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = new Date('2026-06-18T09:00:00.000Z');
  const end = new Date('2026-06-18T10:00:00.000Z');

  return {
    id: 'entry-1',
    title: 'Focus',
    startDate: start,
    endDate: end,
    plannedStartDate: start,
    plannedEndDate: end,
    actualStartDate: start,
    actualEndDate: end,
    displayStartDate: start,
    displayEndDate: end,
    status: 'closed',
    color: 'var(--tag-blue)',
    tagId: 'tag-1',
    createdAt: start,
    updatedAt: end,
    duration: 60,
    isMultiDay: false,
    origin: 'planned',
    ...overrides,
  };
}

describe('computeCalendarDayDiffs', () => {
  it('planned と actual が一致する entry は diff item に出さない', () => {
    const result = computeCalendarDayDiffs([entry()], now);

    expect(result.items).toHaveLength(0);
    expect(result.summary).toMatchObject({
      plannedMinutes: 60,
      actualMinutes: 60,
      diffMinutes: 0,
    });
  });

  it('unplanned entry は addition として集計する', () => {
    const result = computeCalendarDayDiffs(
      [
        entry({
          id: 'unplanned-1',
          origin: 'unplanned',
          startDate: new Date('2026-06-18T12:00:00.000Z'),
          endDate: new Date('2026-06-18T12:45:00.000Z'),
          plannedStartDate: null,
          plannedEndDate: null,
          actualStartDate: new Date('2026-06-18T12:00:00.000Z'),
          actualEndDate: new Date('2026-06-18T12:45:00.000Z'),
          displayStartDate: new Date('2026-06-18T12:00:00.000Z'),
          displayEndDate: new Date('2026-06-18T12:45:00.000Z'),
        }),
      ],
      now,
    );

    expect(result.items).toMatchObject([{ kind: 'unplanned', actualMinutes: 45 }]);
    expect(result.summary.unplannedMinutes).toBe(45);
    expect(result.summary.diffMinutes).toBe(45);
  });

  it('skipped planned entry は missed として集計する', () => {
    const result = computeCalendarDayDiffs(
      [
        entry({
          isSkipped: true,
          actualStartDate: null,
          actualEndDate: null,
        }),
      ],
      now,
    );

    expect(result.items).toMatchObject([{ kind: 'missed', plannedMinutes: 60 }]);
    expect(result.summary.missedMinutes).toBe(60);
    expect(result.summary.diffMinutes).toBe(-60);
  });

  it('skipped planned entry は actual が残っていても実績集計から除外する', () => {
    const result = computeCalendarDayDiffs(
      [
        entry({
          isSkipped: true,
          actualStartDate: new Date('2026-06-18T09:00:00.000Z'),
          actualEndDate: new Date('2026-06-18T10:00:00.000Z'),
        }),
      ],
      now,
    );

    expect(result.summary).toMatchObject({
      plannedMinutes: 60,
      actualMinutes: 0,
      missedMinutes: 60,
      diffMinutes: -60,
    });
  });

  it('実績なしで終了した planned entry は missed として集計する', () => {
    const result = computeCalendarDayDiffs(
      [
        entry({
          actualStartDate: null,
          actualEndDate: null,
        }),
      ],
      now,
    );

    expect(result.items).toMatchObject([{ kind: 'missed' }]);
    expect(result.entryIds.has('entry-1')).toBe(true);
  });

  it('開始がずれた planned entry は shifted にする', () => {
    const result = computeCalendarDayDiffs(
      [
        entry({
          actualStartDate: new Date('2026-06-18T09:20:00.000Z'),
          actualEndDate: new Date('2026-06-18T10:20:00.000Z'),
        }),
      ],
      now,
    );

    expect(result.items).toMatchObject([{ kind: 'shifted', startDiffMinutes: 20, diffMinutes: 0 }]);
  });

  it('開始は同じで duration だけ変わった planned entry は resized にする', () => {
    const result = computeCalendarDayDiffs(
      [
        entry({
          actualEndDate: new Date('2026-06-18T10:30:00.000Z'),
        }),
      ],
      now,
    );

    expect(result.items).toMatchObject([{ kind: 'resized', diffMinutes: 30 }]);
  });
});
