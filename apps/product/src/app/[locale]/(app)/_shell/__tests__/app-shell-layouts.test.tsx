import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/projects'));
const bannerState = vi.hoisted(() => ({
  current: { visible: true, message: 'Payment required' },
}));

vi.mock('@dayopt/i18n/navigation', () => ({
  usePathname: pathnameMock,
}));

vi.mock('@/features/auth', () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

vi.mock('@/features/calendar', () => ({
  isCalendarViewPath: (pathname: string) => /^\/(?:day|week|[2-7]day)(?:\/|$)/.test(pathname),
  ActivityChipRow: () => <div data-testid="activity-chip-row" />,
}));

vi.mock('@/lib/user', () => ({
  getAvatarUrl: () => null,
  getDisplayName: () => 'User',
}));

vi.mock('@/lib/stores/useShellStore', () => ({
  useShellStore: {
    use: {
      sidebar: () => ({ open: true, width: 256 }),
      sidebarSuppressed: () => false,
      toggleSidebar: () => vi.fn(),
      pageTitle: () => 'Page title',
    },
  },
}));

vi.mock('@/components/shell/AnimatedWidthPanel', () => ({
  AnimatedWidthPanel: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
}));

vi.mock('@/components/shell/sidebar', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../SidebarContent', () => ({
  SidebarContent: () => <div>Sidebar</div>,
}));

vi.mock('../MobileAccountButton', () => ({
  ConnectedMobileAccountButton: () => <button type="button">Account</button>,
}));

vi.mock('../useAppInlineBanner', () => ({
  useAppInlineBanner: () => bannerState.current,
}));

import { DesktopLayout } from '../desktop-layout';
import { MobileLayout } from '../mobile-layout';

function expectBefore(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

function expectSingleVisibleBanner(container: HTMLElement) {
  expect(container.querySelectorAll('[data-slot="inline-banner"]')).toHaveLength(1);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Payment required');
  return alert;
}

describe('DesktopLayout', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/projects');
    bannerState.current = { visible: true, message: 'Payment required' };
  });

  it('shows one banner between the shell header and main content on a normal route', () => {
    const { container } = render(
      <DesktopLayout>
        <div>Content</div>
      </DesktopLayout>,
    );

    const header = screen.getByRole('banner');
    const alert = expectSingleVisibleBanner(container);
    const main = screen.getByRole('main');

    expectBefore(header, alert);
    expectBefore(alert, main);
  });

  it('keeps one banner before main content and omits the shell header on prefixless calendar routes', () => {
    pathnameMock.mockReturnValue('/day');

    const { container } = render(
      <DesktopLayout>
        <div>Calendar</div>
      </DesktopLayout>,
    );

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    const alert = expectSingleVisibleBanner(container);
    expectBefore(alert, screen.getByRole('main'));
  });

  it('keeps a single hidden banner container out of the accessibility tree', () => {
    bannerState.current = { visible: false, message: '' };

    const { container } = render(
      <DesktopLayout>
        <div>Content</div>
      </DesktopLayout>,
    );

    expect(container.querySelectorAll('[data-slot="inline-banner"]')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MobileLayout', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/projects');
    bannerState.current = { visible: true, message: 'Payment required' };
  });

  it('shows one banner between the shell header and main content on a normal route', () => {
    const { container } = render(
      <MobileLayout>
        <div>Content</div>
      </MobileLayout>,
    );

    const header = screen.getByRole('banner');
    const alert = expectSingleVisibleBanner(container);
    const main = screen.getByRole('main');

    expectBefore(header, alert);
    expectBefore(alert, main);
  });

  it.each(['/day', '/settings', '/settings/billing'])(
    'shows one banner before main content and omits the shell header on %s',
    (pathname) => {
      pathnameMock.mockReturnValue(pathname);

      const { container } = render(
        <MobileLayout>
          <div>Own header content</div>
        </MobileLayout>,
      );

      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      const alert = expectSingleVisibleBanner(container);
      expectBefore(alert, screen.getByRole('main'));
      expect(screen.queryAllByTestId('activity-chip-row')).toHaveLength(
        pathname === '/day' ? 1 : 0,
      );
    },
  );

  it('keeps a single hidden banner container out of the accessibility tree', () => {
    bannerState.current = { visible: false, message: '' };

    const { container } = render(
      <MobileLayout>
        <div>Content</div>
      </MobileLayout>,
    );

    expect(container.querySelectorAll('[data-slot="inline-banner"]')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
