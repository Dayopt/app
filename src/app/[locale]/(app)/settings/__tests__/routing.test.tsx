import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockHasMounted = false;
let mockIsMobile = false;
let mockCategory = 'profile';

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockOpenSettings = vi.fn();
const mockOpenContact = vi.fn();
const mockLogout = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ category: mockCategory }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ja',
}));

vi.mock('@/lib/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
      React.createElement('a', { href, ...props }, children),
    useRouter: () => ({
      replace: mockReplace,
      push: mockPush,
    }),
  };
});

vi.mock('@/features/settings', () => ({
  SETTINGS_CATEGORIES: [
    { id: 'profile', labelKey: 'settings.category.profile', icon: () => <span>icon</span> },
    { id: 'billing', labelKey: 'settings.category.billing', icon: () => <span>icon</span> },
  ],
  isValidCategory: (category: string) => ['profile', 'billing'].includes(category),
  SettingsContent: ({ category }: { category: string }) => <div>{category}</div>,
}));

vi.mock('@/hooks/useHasMounted', () => ({
  useHasMounted: () => mockHasMounted,
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsMobile,
}));

vi.mock('@/shell/stores/useShellStore', () => ({
  useShellStore: (
    selector: (state: { openSettings: typeof mockOpenSettings; openSheet: () => void }) => unknown,
  ) => selector({ openSettings: mockOpenSettings, openSheet: vi.fn() }),
}));

vi.mock('@/shell/stores/useContactStore', () => ({
  useContactStore: (selector: (state: { open: typeof mockOpenContact }) => unknown) =>
    selector({ open: mockOpenContact }),
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: (
    selector: (state: {
      user: { email: string; user_metadata: Record<string, unknown> };
    }) => unknown,
  ) =>
    selector({
      user: {
        email: 'tester@example.com',
        user_metadata: { username: 'Tester' },
      },
    }),
}));

vi.mock('@/shell/hooks/useLogout', () => ({
  useLogout: () => ({ logout: mockLogout, isLoggingOut: false }),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (asChild ? children : <button {...props}>{children}</button>),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    billing: {
      getOverview: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
    },
  },
}));

vi.mock('@/shell/components/AppHeader', () => ({
  AppHeader: ({
    children,
    leftSlot,
    rightSlot,
  }: {
    children: React.ReactNode;
    leftSlot?: React.ReactNode;
    rightSlot?: React.ReactNode;
  }) => (
    <header>
      {leftSlot}
      {children}
      {rightSlot}
    </header>
  ),
}));

import SettingsCategoryPage from '../[category]/page';
import SettingsPage from '../page';

describe('settings route hydration guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasMounted = false;
    mockIsMobile = false;
    mockCategory = 'profile';
  });

  it('does not redirect desktop settings before mount state is ready', () => {
    render(<SettingsPage />);

    expect(mockOpenSettings).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects desktop settings after mount state is ready', () => {
    mockHasMounted = true;

    render(<SettingsPage />);

    expect(mockOpenSettings).toHaveBeenCalledWith('profile');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('renders mobile settings content without redirect', () => {
    mockHasMounted = true;
    mockIsMobile = true;

    render(<SettingsPage />);

    expect(mockOpenSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Tester')).toBeInTheDocument();
  });

  it('does not redirect desktop category page before mount state is ready', () => {
    render(<SettingsCategoryPage />);

    expect(mockOpenSettings).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects desktop category page after mount state is ready', () => {
    mockHasMounted = true;
    mockCategory = 'billing';

    render(<SettingsCategoryPage />);

    expect(mockOpenSettings).toHaveBeenCalledWith('billing');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
