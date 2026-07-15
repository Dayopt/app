import { describe, expect, it } from 'vitest';

import { buildDragPreviewEntry, resolveCalendarLanePresentation } from '../CalendarGridContent';

describe('CalendarGridContent', () => {
  it.each([
    ['day', false],
    ['3day', false],
    ['5day', true],
    ['week', true],
  ] as const)('%s は共通38%%レーンと表示密度を解決する', (viewMode, compactCards) => {
    expect(resolveCalendarLanePresentation(viewMode)).toEqual({
      planLaneWidthPercent: 38,
      compactCards,
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
      timeblockState: 'upcoming' as const,
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
