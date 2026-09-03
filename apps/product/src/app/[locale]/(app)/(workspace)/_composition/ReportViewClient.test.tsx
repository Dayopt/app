import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateToDate = vi.hoisted(() => vi.fn());
const routerPush = vi.hoisted(() => vi.fn());
const navigationState = vi.hoisted(() => ({
  current: { currentDate: new Date(2026, 8, 2), viewType: 'week' } as {
    currentDate: Date;
    viewType: string;
  } | null,
}));

vi.mock('@/features/calendar', () => ({
  useCalendarNavigation: () =>
    navigationState.current === null ? null : { ...navigationState.current, navigateToDate },
}));

vi.mock('@dayopt/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: (selector: (p: { timezone: string; weekStartsOn: 0 | 1 | 6 }) => unknown) =>
    selector({ timezone: 'Asia/Tokyo', weekStartsOn: 1 }),
}));

vi.mock('@/lib/stores/useShellStore', () => ({
  useShellStore: { use: { sidebar: () => ({ open: true }), toggleSidebar: () => vi.fn() } },
}));

vi.mock('../../_shell/MobileAccountButton', () => ({
  ConnectedMobileAccountButton: () => <div data-testid="account-button" />,
}));

vi.mock('@/features/review', async () => {
  const actual = await vi.importActual<typeof import('@/features/review')>('@/features/review');
  return {
    ...actual,
    ReportBody: ({ anchorDate }: { anchorDate: string }) => (
      <div data-testid="report-body">{anchorDate}</div>
    ),
    ReportHeader: ({
      periodStart,
      periodEnd,
      onNavigate,
      onGranularityChange,
    }: {
      periodStart: Date;
      periodEnd: Date;
      onNavigate: (direction: 'prev' | 'next' | 'today') => void;
      onGranularityChange: (granularity: 'week' | 'month' | 'year') => void;
    }) => (
      <div>
        <span data-testid="period">
          {periodStart.toDateString()}–{periodEnd.toDateString()}
        </span>
        <button type="button" onClick={() => onNavigate('prev')}>
          prev
        </button>
        <button type="button" onClick={() => onNavigate('next')}>
          next
        </button>
        <button type="button" onClick={() => onGranularityChange('month')}>
          month
        </button>
      </div>
    ),
  };
});

import { ReportViewClient } from './ReportViewClient';

describe('ReportViewClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState.current = { currentDate: new Date(2026, 8, 2), viewType: 'week' };
  });

  it('表示中の日付を CalendarNavigationContext から取る', () => {
    render(<ReportViewClient granularity="week" />);

    // 2026-09-02（水）を含む週は 08-31（月）〜 09-06（日）
    expect(screen.getByTestId('report-body')).toHaveTextContent('2026-09-02');
    expect(screen.getByTestId('period')).toHaveTextContent('Mon Aug 31 2026');
  });

  /**
   * これが本 test の主眼。`?date=` を server component の prop で受けると、
   * `navigateToDate` は `history.replaceState` を書くだけで RSC を再描画しないため
   * 期間移動が画面に反映されなくなる（#2577 のクロスレビュー P1）。
   */
  it('Context の日付が変わると表示中の期間も変わる', () => {
    const { rerender } = render(<ReportViewClient granularity="week" />);
    expect(screen.getByTestId('period')).toHaveTextContent('Mon Aug 31 2026');

    navigationState.current = { currentDate: new Date(2026, 7, 26), viewType: 'week' };
    rerender(<ReportViewClient granularity="week" />);

    // 前週（08-24〜08-30）へ移る
    expect(screen.getByTestId('period')).toHaveTextContent('Mon Aug 24 2026');
    expect(screen.getByTestId('report-body')).toHaveTextContent('2026-08-26');
  });

  it('前後の移動が粒度ぶんだけ Context を進める', async () => {
    const user = userEvent.setup();
    render(<ReportViewClient granularity="week" />);

    await user.click(screen.getByRole('button', { name: 'prev' }));
    expect(navigateToDate).toHaveBeenCalledWith(new Date(2026, 7, 26), true);

    await user.click(screen.getByRole('button', { name: 'next' }));
    expect(navigateToDate).toHaveBeenCalledWith(new Date(2026, 8, 9), true);
  });

  it('月粒度では 1 か月ずつ動く', async () => {
    const user = userEvent.setup();
    render(<ReportViewClient granularity="month" />);

    await user.click(screen.getByRole('button', { name: 'next' }));
    expect(navigateToDate).toHaveBeenCalledWith(new Date(2026, 9, 2), true);
  });

  it('粒度切替は URL の range を書き換える（日付は保つ）', async () => {
    const user = userEvent.setup();
    render(<ReportViewClient granularity="week" />);

    await user.click(screen.getByRole('button', { name: 'month' }));

    expect(routerPush).toHaveBeenCalledWith('/report?date=2026-09-02&range=month');
    // 日付の移動は伴わない
    expect(navigateToDate).not.toHaveBeenCalled();
  });

  it('Provider が無くても落ちない', () => {
    navigationState.current = null;

    expect(() => render(<ReportViewClient granularity="week" />)).not.toThrow();
  });
});
