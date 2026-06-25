import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockPathname = '/ja/day';
const mockUseMediaQuery = vi.fn(() => false);

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('@/lib/hooks/useMediaQuery', () => ({
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
      <span data-testid="panel">{navigation.panelKind ?? 'none'}</span>
      <span data-testid="review-tag">{navigation.reviewTagId ?? 'none'}</span>
      <button
        type="button"
        onClick={() => navigation.navigateToDate(new Date('2026-03-29T12:00:00.000Z'))}
      >
        move
      </button>
      <button type="button" onClick={() => navigation.navigateToDate(new Date('2026-03-30'), true)}>
        move-url
      </button>
      <button type="button" onClick={() => navigation.setPanelKind('diff')}>
        diff-on
      </button>
      <button
        type="button"
        onClick={() => navigation.setPanelKind('review', { reviewTagId: 'tag-1' })}
      >
        review-on
      </button>
      <button type="button" onClick={() => navigation.changeView('week')}>
        week
      </button>
    </div>
  );
}

describe('CalendarNavigationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaQuery.mockReturnValue(false);
    mockPathname = '/ja/day';
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25');
  });

  it('resolves initialDate from URL searchParams', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25');
    mockPathname = '/ja/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-25');
    expect(screen.getByTestId('view')).toHaveTextContent('day');
  });

  it('keeps internal date changes after navigateToDate', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25');
    mockPathname = '/ja/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'move' }));
    expect(screen.getByTestId('date')).toHaveTextContent('2026-03-29');
  });

  it('resolves week view from pathname', () => {
    window.history.replaceState(null, '', '/ja/week?date=2026-03-25');
    mockPathname = '/ja/week';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('view')).toHaveTextContent('week');
  });

  it('resolves compare mode from day URL searchParams', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25&compare=1');
    mockPathname = '/ja/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('panel')).toHaveTextContent('diff');
  });

  it('syncs compare mode when returning to an already-active day view URL', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25');
    mockPathname = '/ja/day';

    const { rerender } = render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('view')).toHaveTextContent('day');
    expect(screen.getByTestId('panel')).toHaveTextContent('none');

    mockPathname = '/ja/settings';
    rerender(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    window.history.replaceState(null, '', '/ja/day?date=2026-03-25&compare=1');
    mockPathname = '/ja/day';
    rerender(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    expect(screen.getByTestId('view')).toHaveTextContent('day');
    expect(screen.getByTestId('panel')).toHaveTextContent('diff');
  });

  it('writes compare=1 when day compare is enabled', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25');
    mockPathname = '/ja/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'diff-on' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('diff');
    expect(window.location.pathname + window.location.search).toBe(
      '/ja/day?date=2026-03-25&compare=1',
    );
  });

  it('preserves compare mode when date navigation updates the URL', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25&compare=1');
    mockPathname = '/ja/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'move-url' }));
    expect(window.location.pathname + window.location.search).toBe(
      '/ja/day?date=2026-03-30&compare=1',
    );
  });

  it('clears compare mode when changing to a non-day view', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25&compare=1');
    mockPathname = '/ja/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'week' }));
    expect(screen.getByTestId('compare')).toHaveTextContent('off');
    expect(window.location.pathname + window.location.search).toBe('/ja/week?date=2026-03-25');
  });

  it('opens review panel on week view with reviewTagId', () => {
    window.history.replaceState(null, '', '/ja/calendar/day?date=2026-03-25');
    mockPathname = '/ja/calendar/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'review-on' }));
    expect(screen.getByTestId('view')).toHaveTextContent('week');
    expect(screen.getByTestId('panel')).toHaveTextContent('review');
    expect(screen.getByTestId('review-tag')).toHaveTextContent('tag-1');
    expect(window.location.pathname + window.location.search).toBe(
      '/ja/calendar/week?date=2026-03-25&panel=review&reviewTagId=tag-1',
    );
  });

  it('opens review panel as a day view bottom sheet on mobile', () => {
    mockUseMediaQuery.mockReturnValue(true);
    window.history.replaceState(null, '', '/ja/calendar/day?date=2026-03-25');
    mockPathname = '/ja/calendar/day';

    render(
      <CalendarNavigationProvider>
        <TestConsumer />
      </CalendarNavigationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'review-on' }));
    expect(screen.getByTestId('view')).toHaveTextContent('day');
    expect(screen.getByTestId('panel')).toHaveTextContent('review');
    expect(screen.getByTestId('review-tag')).toHaveTextContent('tag-1');
    expect(window.location.pathname + window.location.search).toBe(
      '/ja/calendar/day?date=2026-03-25&panel=review&reviewTagId=tag-1',
    );
  });

  it('preserves calendar state when the current route is not a calendar page', () => {
    window.history.replaceState(null, '', '/ja/day?date=2026-03-25');
    mockPathname = '/ja/day';

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
