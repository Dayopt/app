import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/calendar'));
const navigationMock = vi.hoisted(() =>
  vi.fn(() => ({ currentDate: new Date(2026, 2, 25), viewType: 'week' as const })),
);

vi.mock('@dayopt/i18n/navigation', () => ({
  usePathname: pathnameMock,
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/features/calendar', () => ({
  resolveWorkspaceTab: (pathname: string) =>
    pathname === '/calendar' ? 'calendar' : pathname === '/report' ? 'report' : 'other',
  formatCalendarDateParam: () => '2026-03-25',
  useCalendarNavigation: () => navigationMock(),
}));

import { BottomTabBar } from '../BottomTabBar';

describe('BottomTabBar', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/calendar');
    navigationMock.mockReturnValue({ currentDate: new Date(2026, 2, 25), viewType: 'week' });
  });

  it('renders exactly 2 tabs (calendar / report)', () => {
    render(<BottomTabBar />);

    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('marks the active tab via aria-selected based on the current path', () => {
    pathnameMock.mockReturnValue('/report');

    render(<BottomTabBar />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('carries date/view into hrefs like the desktop WorkspaceTabs', () => {
    render(<BottomTabBar />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('href', '/calendar?view=week&date=2026-03-25');
    expect(tabs[1]).toHaveAttribute('href', '/report?date=2026-03-25');
  });
});
