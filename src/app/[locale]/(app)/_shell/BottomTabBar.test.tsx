import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockPathname = '/ja/calendar/day';
let mockClientPage: 'calendar' | 'stats' | null = null;

const mockPush = vi.fn();
const mockSwitchToPage = vi.fn();
const mockResetToServer = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
  redirect: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/features/calendar', async () => {
  const dateFns = await import('date-fns');
  return {
    useCalendarNavigation: () => ({
      viewType: 'week',
      currentDate: new Date(2026, 2, 25, 23, 45, 0, 0),
    }),
    formatCalendarDateParam: (date: Date) => dateFns.format(date, 'yyyy-MM-dd'),
  };
});

vi.mock('@/lib/stores/useClientRouterStore', () => ({
  useClientRouterStore: (
    selector: (state: {
      switchToPage: typeof mockSwitchToPage;
      clientPage: typeof mockClientPage;
      resetToServer: typeof mockResetToServer;
    }) => unknown,
  ) =>
    selector({
      switchToPage: mockSwitchToPage,
      clientPage: mockClientPage,
      resetToServer: mockResetToServer,
    }),
}));

vi.mock('@/features/auth', () => ({
  useAuthStore: (
    selector: (state: {
      user: { email: string; user_metadata: Record<string, unknown> };
    }) => unknown,
  ) =>
    selector({
      user: {
        email: 'tester@example.com',
        user_metadata: {
          full_name: 'Tester',
        },
      },
    }),
}));

vi.mock('@/features/stats', () => ({
  useStatsFilterStore: (selector: (state: { granularity: string; currentDate: Date }) => unknown) =>
    selector({ granularity: 'week', currentDate: new Date(2026, 2, 25) }),
}));

import { BottomTabBar } from './BottomTabBar';

describe('BottomTabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/ja/calendar/day';
    mockClientPage = null;
  });

  it('uses page navigation semantics instead of tab semantics', () => {
    render(<BottomTabBar />);

    const navigation = screen.getByRole('navigation', { name: 'common.aria.pageNavigation' });
    const calendarLink = screen.getByRole('link', {
      name: /navigation\.bottomTab\.calendar/,
    });

    expect(navigation).not.toHaveAttribute('role', 'tablist');
    expect(calendarLink).toHaveAttribute('aria-current', 'page');
    expect(calendarLink).not.toHaveAttribute('role', 'tab');
  });

  it('marks the route derived from pathname as current', () => {
    mockPathname = '/ja/stats/review';

    render(<BottomTabBar />);

    expect(screen.getByRole('link', { name: /navigation\.bottomTab\.stats/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: /navigation\.bottomTab\.calendar/ }),
    ).not.toHaveAttribute('aria-current');
  });

  it('keeps the local calendar day when generating the return URL', () => {
    mockPathname = '/ja/stats/review';

    render(<BottomTabBar />);

    const calendarLink = screen.getByRole('link', { name: /navigation\.bottomTab\.calendar/ });

    expect(calendarLink).toHaveAttribute('href', '/ja/calendar/week?date=2026-03-25');
  });
});
