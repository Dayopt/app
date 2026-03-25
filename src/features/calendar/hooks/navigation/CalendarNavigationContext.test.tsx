import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockPathname = '/ja/calendar/day';
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
    mockPathname = '/ja/calendar/day';
    window.history.replaceState(null, '', '/ja/calendar/day?date=2026-03-25');
  });

  it('syncs currentDate when initialDate prop changes', () => {
    const { rerender } = render(
      <CalendarNavigationProvider
        initialDate={new Date('2026-03-25T12:00:00.000Z')}
        initialView="day"
        isCalendarPage
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-25');

    rerender(
      <CalendarNavigationProvider
        initialDate={new Date('2026-03-28T12:00:00.000Z')}
        initialView="day"
        isCalendarPage
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
        isCalendarPage
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
        isCalendarPage
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
  });

  it('preserves calendar state when the current route is not a calendar page', () => {
    const { rerender } = render(
      <CalendarNavigationProvider
        initialDate={new Date('2026-03-25T12:00:00.000Z')}
        initialView="day"
        isCalendarPage
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'move' }));
    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
    expect(screen.getByTestId('view')).toHaveTextContent('day');

    mockPathname = '/ja/settings';
    rerender(
      <CalendarNavigationProvider
        initialDate={new Date('2026-04-01T12:00:00.000Z')}
        initialView="week"
        isCalendarPage={false}
      >
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
    expect(screen.getByTestId('view')).toHaveTextContent('day');
  });
});
