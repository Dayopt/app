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

  it('resolves initialDate from URL searchParams', () => {
    window.history.replaceState(null, '', '/ja/calendar/day?date=2026-03-25');
    mockPathname = '/ja/calendar/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-25');
    expect(screen.getByTestId('view')).toHaveTextContent('day');
  });

  it('keeps internal date changes after navigateToDate', () => {
    window.history.replaceState(null, '', '/ja/calendar/day?date=2026-03-25');
    mockPathname = '/ja/calendar/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'move' }));
    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
  });

  it('resolves week view from pathname', () => {
    window.history.replaceState(null, '', '/ja/calendar/week?date=2026-03-25');
    mockPathname = '/ja/calendar/week';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('view')).toHaveTextContent('week');
  });

  it('preserves calendar state when the current route is not a calendar page', () => {
    window.history.replaceState(null, '', '/ja/calendar/day?date=2026-03-25');
    mockPathname = '/ja/calendar/day';

    const { rerender } = render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'move' }));
    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
    expect(screen.getByTestId('view')).toHaveTextContent('day');

    // Settings ページに遷移してもカレンダー状態は維持される
    mockPathname = '/ja/settings';
    rerender(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
    expect(screen.getByTestId('view')).toHaveTextContent('day');
  });
});
