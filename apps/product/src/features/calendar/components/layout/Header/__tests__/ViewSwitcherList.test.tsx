import { render, screen } from '@testing-library/react';
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

  it('モバイルはday-onlyで、weekの選択肢を表示しない（#2299）', () => {
    render(<ViewSwitcherList />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });
});
