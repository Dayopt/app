import { describe, expect, it } from 'vitest';

import {
  buildDragPreviewEntry,
  getGhostEntryHeight,
  minutesToSelection,
} from '../CalendarGridContent';

describe('CalendarGridContent', () => {
  it('drag ghost uses the rendered entry height instead of a full-day sentinel height', () => {
    expect(getGhostEntryHeight({ height: '60px' })).toBe(60);
    expect(getGhostEntryHeight({ height: 58 })).toBe(58);
  });

  it('falls back to a compact height when entry style is unavailable', () => {
    expect(getGhostEntryHeight(undefined)).toBe(20);
    expect(getGhostEntryHeight({ height: 'auto' })).toBe(20);
  });

  it('planned の前半 gap 分数をインライン作成 selection に変換する', () => {
    const date = new Date('2026-06-04T00:00:00');

    expect(minutesToSelection(date, 13 * 60, 13 * 60 + 30, 'planned-gap')).toEqual({
      date,
      startHour: 13,
      startMinute: 0,
      endHour: 13,
      endMinute: 30,
      creationSource: 'planned-gap',
    });
  });

  it('drag preview は planned と actual のズレを保って表示用 entry を作る', () => {
    const entry = {
      id: 'entry-1',
      title: 'dev',
      startDate: new Date('2026-06-04T13:00:00.000Z'),
      endDate: new Date('2026-06-04T15:00:00.000Z'),
      displayStartDate: new Date('2026-06-04T13:00:00.000Z'),
      displayEndDate: new Date('2026-06-04T15:00:00.000Z'),
      plannedStartDate: new Date('2026-06-04T13:00:00.000Z'),
      plannedEndDate: new Date('2026-06-04T15:00:00.000Z'),
      actualStartDate: new Date('2026-06-04T13:30:00.000Z'),
      actualEndDate: new Date('2026-06-04T16:45:00.000Z'),
      status: 'open' as const,
      color: 'blue',
      tagId: 'tag-1',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      updatedAt: new Date('2026-06-04T00:00:00.000Z'),
      duration: 120,
      isMultiDay: false,
      origin: 'planned' as const,
      entryState: 'upcoming' as const,
    };

    const previewEntry = buildDragPreviewEntry(entry, {
      start: new Date('2026-06-04T15:00:00.000Z'),
      end: new Date('2026-06-04T17:00:00.000Z'),
    });

    expect(previewEntry.startDate?.toISOString()).toBe('2026-06-04T15:00:00.000Z');
    expect(previewEntry.endDate?.toISOString()).toBe('2026-06-04T17:00:00.000Z');
    expect(previewEntry.plannedStartDate?.toISOString()).toBe('2026-06-04T15:00:00.000Z');
    expect(previewEntry.plannedEndDate?.toISOString()).toBe('2026-06-04T17:00:00.000Z');
    expect(previewEntry.actualStartDate?.toISOString()).toBe('2026-06-04T15:30:00.000Z');
    expect(previewEntry.actualEndDate?.toISOString()).toBe('2026-06-04T18:45:00.000Z');
  });
});
