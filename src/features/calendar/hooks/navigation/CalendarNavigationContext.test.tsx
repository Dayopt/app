import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPathname = '/ja/calendar/day';
const mockUseMediaQuery = vi.fn(() => false);

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockUseMediaQuery(),
}));

import { CalendarNavigationProvider, useCalendarNavigation } from './CalendarNavigationContext';

function TestConsumer() {
  const navigation = useCalendarNavigation();

  if (!navigation) {
    throw new Error('Calendar navigation context is missing');
  }

  return (
    <div>
      <span data-testid="date">{navigation.currentDate.toISOString().slice(0, 10)}</span>
      <span data-testid="view">{navigation.viewType}</span>
      <button
        type="button"
        onClick={() => navigation.navigateToDate(new Date('2026-03-29T12:00:00.000Z'))}
      >
        move
      </button>
    </div>
  );
}

describe('CalendarNavigationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaQuery.mockReturnValue(false);
    window.history.replaceState(null, '', '/ja/calendar/day?date=2026-03-25');
  });

  it('syncs currentDate when initialDate prop changes', () => {
    const { rerender } = render(
      <CalendarNavigationProvider
        initialDate={new Date('2026-03-25T12:00:00.000Z')}
        initialView="day"
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-25');

    rerender(
      <CalendarNavigationProvider
        initialDate={new Date('2026-03-28T12:00:00.000Z')}
        initialView="day"
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-28');
  });

  it('keeps internal date changes until the URL-derived date actually changes', () => {
    const { rerender } = render(
      <CalendarNavigationProvider
        initialDate={new Date('2026-03-25T12:00:00.000Z')}
        initialView="day"
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'move' }));
    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');

    rerender(
      <CalendarNavigationProvider
        initialDate={new Date('2026-03-25T12:00:00.000Z')}
        initialView="day"
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
  });
});
