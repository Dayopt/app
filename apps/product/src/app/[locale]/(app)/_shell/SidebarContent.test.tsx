import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/calendar'));

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
  useCalendarNavigation: () => null,
  ActivityFilterList: () => <div data-testid="activity-filter-list" />,
  ViewSwitcherList: () => <div data-testid="view-switcher-list" />,
}));

vi.mock('@/components/ui/inputs/mini-calendar', () => ({
  MiniCalendar: () => <div data-testid="mini-calendar" />,
}));

vi.mock('@/features/review', () => ({
  ReportFilterList: () => <div data-testid="report-filter-list" />,
  SegmentList: () => <div data-testid="segment-list" />,
}));

vi.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

import { SidebarContent } from './SidebarContent';

describe('SidebarContent', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/calendar');
  });

  it('renders CalendarSidebar (view switcher + activity filter) on /calendar', () => {
    render(<SidebarContent />);

    expect(screen.getByTestId('view-switcher-list')).toBeInTheDocument();
    expect(screen.getByTestId('activity-filter-list')).toBeInTheDocument();
  });

  it('renders ReportSidebar（カテゴリーフィルタ + セグメント一覧、calendar の view-switcher/activity-filter は出さない）on /report', () => {
    pathnameMock.mockReturnValue('/report');

    render(<SidebarContent />);

    expect(screen.queryByTestId('view-switcher-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-filter-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-filter-list')).toBeInTheDocument();
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
  });

  it('falls back to CalendarSidebar on workspace-external paths (e.g. /settings)', () => {
    pathnameMock.mockReturnValue('/settings');

    render(<SidebarContent />);

    expect(screen.getByTestId('view-switcher-list')).toBeInTheDocument();
  });
});
