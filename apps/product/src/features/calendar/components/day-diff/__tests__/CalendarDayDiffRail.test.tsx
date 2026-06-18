import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { computeCalendarDayDiffs } from '../../../lib/day-diff';
import type { CalendarEvent } from '../../../types/calendar.types';
import { CalendarDayDiffRail } from '../CalendarDayDiffRail';

vi.mock('@/features/tags', () => ({
  useTagsMap: () => ({
    getTagById: () => ({ id: 'tag-1', name: 'Work', color: 'blue', icon: null }),
  }),
}));

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: <T,>(selector: (preferences: { timezone: string }) => T) =>
    selector({ timezone: 'UTC' }),
}));

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
    actualStartDate: new Date('2026-06-18T09:30:00.000Z'),
    actualEndDate: new Date('2026-06-18T10:30:00.000Z'),
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

describe('CalendarDayDiffRail', () => {
  it('diff がないとき empty state を表示する', () => {
    const entries = [
      entry({
        actualStartDate: new Date('2026-06-18T09:00:00.000Z'),
        actualEndDate: new Date('2026-06-18T10:00:00.000Z'),
      }),
    ];

    render(
      <CalendarDayDiffRail
        diff={computeCalendarDayDiffs(entries, now)}
        entries={entries}
        onEntryClick={vi.fn()}
      />,
    );

    expect(screen.getByText('calendar.compare.rail.emptyTitle')).toBeInTheDocument();
  });

  it('summary と chronological list を表示する', () => {
    const entries = [
      entry(),
      entry({
        id: 'entry-2',
        title: 'Unexpected call',
        origin: 'unplanned',
        startDate: new Date('2026-06-18T12:00:00.000Z'),
        endDate: new Date('2026-06-18T12:30:00.000Z'),
        plannedStartDate: null,
        plannedEndDate: null,
        actualStartDate: new Date('2026-06-18T12:00:00.000Z'),
        actualEndDate: new Date('2026-06-18T12:30:00.000Z'),
        displayStartDate: new Date('2026-06-18T12:00:00.000Z'),
        displayEndDate: new Date('2026-06-18T12:30:00.000Z'),
      }),
    ];

    render(
      <CalendarDayDiffRail
        diff={computeCalendarDayDiffs(entries, now)}
        entries={entries}
        onEntryClick={vi.fn()}
      />,
    );

    expect(screen.getByText('calendar.compare.rail.summary.planned')).toBeInTheDocument();
    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(screen.getByText('Unexpected call')).toBeInTheDocument();
  });

  it('item click で該当 entry を渡す', async () => {
    const user = userEvent.setup();
    const entries = [entry()];
    const onEntryClick = vi.fn();

    render(
      <CalendarDayDiffRail
        diff={computeCalendarDayDiffs(entries, now)}
        entries={entries}
        onEntryClick={onEntryClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Focus/ }));

    expect(onEntryClick).toHaveBeenCalledWith(entries[0]);
  });
});
