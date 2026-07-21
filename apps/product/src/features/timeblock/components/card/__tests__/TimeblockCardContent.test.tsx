import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../../types/calendar-event';

import { TimeblockCardContent } from '../TimeblockCardContent';

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

function renderContent(plan: CalendarEvent) {
  return render(<TimeblockCardContent plan={plan} tagName="dev" />);
}

describe('TimeblockCardContent', () => {
  it('12時間表記ではカードの時刻範囲をAM/PMで表示する', () => {
    render(<TimeblockCardContent plan={baseEntry} tagName="dev" timeFormat="12h" />);

    expect(screen.getByText('1:00 PM 〜 3:00 PM')).toBeInTheDocument();
  });

  it('actual がずれた planned entry は Inspector と同じ予定/記録ラベルをアイコン行に持つ', () => {
    const { container } = renderContent({
      ...baseEntry,
      plannedStartDate: new Date('2026-06-04T13:00:00'),
      plannedEndDate: new Date('2026-06-04T15:00:00'),
      actualStartDate: new Date('2026-06-04T13:30:00'),
      actualEndDate: new Date('2026-06-04T16:45:00'),
    });

    expect(container.querySelector('[data-entry-time-kind="planned"]')).toBeInTheDocument();
    expect(container.querySelector('[data-entry-time-kind="actual"]')).toBeInTheDocument();
    expect(screen.getByText('timeblock.inspector.time.planned')).toHaveClass('sr-only');
    expect(screen.getByText('timeblock.inspector.time.actual')).toHaveClass('sr-only');
    expect(screen.getByText('13:00 〜 15:00')).toBeInTheDocument();
    expect(screen.getByText('13:30 〜 16:45')).toBeInTheDocument();
  });

  it('予定だけの planned entry は予定アイコン行だけを表示する', () => {
    const { container } = renderContent(baseEntry);

    expect(container.querySelector('[data-entry-time-kind="planned"]')).toBeInTheDocument();
    expect(container.querySelector('[data-entry-time-kind="actual"]')).not.toBeInTheDocument();
    expect(screen.getByText('timeblock.inspector.time.planned')).toHaveClass('sr-only');
    expect(screen.queryByText('timeblock.inspector.time.actual')).not.toBeInTheDocument();
  });

  it('unplanned entry は記録アイコン行だけを表示する', () => {
    const { container } = renderContent({
      ...baseEntry,
      origin: 'unplanned',
      actualStartDate: new Date('2026-06-04T13:00:00'),
      actualEndDate: new Date('2026-06-04T13:30:00'),
    });

    expect(container.querySelector('[data-entry-time-kind="planned"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-entry-time-kind="actual"]')).toBeInTheDocument();
    expect(screen.queryByText('timeblock.inspector.time.planned')).not.toBeInTheDocument();
    expect(screen.getByText('timeblock.inspector.time.actual')).toHaveClass('sr-only');
  });
});
