import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../types/calendar-event';

import { EntryCardContent } from './EntryCardContent';

const baseEntry: CalendarEvent = {
  id: 'entry-1',
  title: 'Test Entry',
  startDate: new Date('2026-06-04T13:00:00'),
  endDate: new Date('2026-06-04T15:00:00'),
  status: 'open',
  color: 'blue',
  createdAt: new Date('2026-06-04T00:00:00'),
  updatedAt: new Date('2026-06-04T00:00:00'),
  displayStartDate: new Date('2026-06-04T13:00:00'),
  displayEndDate: new Date('2026-06-04T15:00:00'),
  duration: 120,
  isMultiDay: false,
  origin: 'planned',
};

describe('EntryCardContent', () => {
  it('actual がずれた planned entry は Inspector と同じ予定/記録ラベルで2行表示する', () => {
    render(
      <EntryCardContent
        plan={{
          ...baseEntry,
          plannedStartDate: new Date('2026-06-04T13:00:00'),
          plannedEndDate: new Date('2026-06-04T15:00:00'),
          actualStartDate: new Date('2026-06-04T13:30:00'),
          actualEndDate: new Date('2026-06-04T16:45:00'),
        }}
        tagName="dev"
      />,
    );

    expect(screen.getByText('entry.inspector.time.planned')).toBeInTheDocument();
    expect(screen.getByText('entry.inspector.time.actual')).toBeInTheDocument();
    expect(screen.getByText(/13:00.*15:00/)).toBeInTheDocument();
    expect(screen.getByText(/13:30.*16:45/)).toBeInTheDocument();
  });

  it('予定だけの planned entry は予定ラベルだけを表示する', () => {
    render(<EntryCardContent plan={baseEntry} tagName="dev" />);

    expect(screen.getByText('entry.inspector.time.planned')).toBeInTheDocument();
    expect(screen.queryByText('entry.inspector.time.actual')).not.toBeInTheDocument();
  });

  it('unplanned entry は記録ラベルだけを表示する', () => {
    render(
      <EntryCardContent
        plan={{
          ...baseEntry,
          origin: 'unplanned',
          actualStartDate: new Date('2026-06-04T13:00:00'),
          actualEndDate: new Date('2026-06-04T13:30:00'),
        }}
        tagName="dev"
      />,
    );

    expect(screen.queryByText('entry.inspector.time.planned')).not.toBeInTheDocument();
    expect(screen.getByText('entry.inspector.time.actual')).toBeInTheDocument();
  });
});
