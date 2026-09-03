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
  ActivityFilterList: ({
    betweenCategoriesAndUncategorized,
  }: {
    betweenCategoriesAndUncategorized?: React.ReactNode;
  }) => <div data-testid="activity-filter-list">{betweenCategoriesAndUncategorized}</div>,
  ViewSwitcherList: () => <div data-testid="view-switcher-list" />,
  TemplateList: () => <div data-testid="template-list" />,
}));

vi.mock('@/components/ui/inputs/mini-calendar', () => ({
  MiniCalendar: () => <div data-testid="mini-calendar" />,
}));

vi.mock('@/features/review', () => ({
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

  it('renders CalendarSidebar (view switcher + activity filter + templates) on /calendar', () => {
    render(<SidebarContent />);

    expect(screen.getByTestId('view-switcher-list')).toBeInTheDocument();
    expect(screen.getByTestId('activity-filter-list')).toBeInTheDocument();
    expect(screen.getByTestId('template-list')).toBeInTheDocument();
  });

  it('テンプレート列は ActivityFilterList の betweenCategoriesAndUncategorized slot（カテゴリの下・未分類の上）へ渡す', () => {
    render(<SidebarContent />);

    const activityFilter = screen.getByTestId('activity-filter-list');
    const templateList = screen.getByTestId('template-list');

    // 実際の「カテゴリ→未分類」間の挿入位置は ActivityFilterList 自身が保証する
    // （betweenCategoriesAndUncategorized slot、ActivityFilterList.tsx）。
    // ここでは CalendarSidebar が正しい slot にテンプレート列を渡していることだけを確認する
    expect(activityFilter.contains(templateList)).toBe(true);
  });

  it('renders ReportSidebar（セグメント一覧、calendar の view-switcher/activity-filter は出さない）on /report', () => {
    pathnameMock.mockReturnValue('/report');

    render(<SidebarContent />);

    expect(screen.queryByTestId('view-switcher-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-filter-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('template-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
  });

  it('falls back to CalendarSidebar on workspace-external paths (e.g. /settings)', () => {
    pathnameMock.mockReturnValue('/settings');

    render(<SidebarContent />);

    expect(screen.getByTestId('view-switcher-list')).toBeInTheDocument();
  });
});
