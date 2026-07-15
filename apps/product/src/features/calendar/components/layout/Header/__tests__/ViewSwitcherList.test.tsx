import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  changeView: vi.fn(),
  closeSidebar: vi.fn(),
}));

vi.mock('@/features/calendar/hooks/navigation/CalendarNavigationContext', () => ({
  useCalendarNavigation: () => ({ viewType: 'day', changeView: mocks.changeView }),
}));

vi.mock('@/lib/stores/useShellStore', () => ({
  useShellStore: (selector: (state: { closeSidebar: () => void }) => unknown) =>
    selector({ closeSidebar: mocks.closeSidebar }),
}));

import { ViewSwitcherList } from '../ViewSwitcherList';

describe('ViewSwitcherList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('モバイルで対応するDayとWeekだけを表示する', () => {
    render(<ViewSwitcherList />);

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('Weekを選ぶとビューを切り替えてSidebarを閉じる', async () => {
    const user = userEvent.setup();
    render(<ViewSwitcherList />);

    await user.click(screen.getAllByRole('button')[1]!);

    expect(mocks.changeView).toHaveBeenCalledWith('week');
    expect(mocks.closeSidebar).toHaveBeenCalledOnce();
  });
});
