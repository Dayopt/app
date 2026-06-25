import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockHasMounted = false;
let mockIsMobile = false;
let mockCategory = 'profile';
let mockSearchParams = new URLSearchParams();

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockOpenSettings = vi.fn();
const mockLogout = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ category: mockCategory }),
  useSearchParams: () => mockSearchParams,
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

vi.mock('@/lib/hooks/useHasMounted', () => ({
  useHasMounted: () => mockHasMounted,
}));

vi.mock('@/lib/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsMobile,
}));

vi.mock('@/lib/stores/useShellStore', () => ({
  useShellStore: (
    selector: (state: { openSettings: typeof mockOpenSettings; openSheet: () => void }) => unknown,
  ) => selector({ openSettings: mockOpenSettings, openSheet: vi.fn() }),
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
        user_metadata: { full_name: 'Tester' },
      },
    }),
}));

vi.mock('@/lib/hooks/useLogout', () => ({
  useLogout: () => ({ logout: mockLogout, isLoggingOut: false }),
}));

// 基底 Avatar は @dayopt/components に昇格済み。表示系のみ stub し、その他の
// 共有 component（Card / Badge / ScrollArea / Skeleton 等）は実体を使う。
vi.mock('@dayopt/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dayopt/components')>()),
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

vi.mock('@/components/shell/AppHeader', () => ({
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
    mockSearchParams = new URLSearchParams();
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
    mockSearchParams = new URLSearchParams(
      'returnTo=%2Fcalendar%2Fweek%3Fdate%3D2026-06-22%26panel%3Dreview',
    );

    render(<SettingsPage />);

    expect(mockOpenSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Tester')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'common.back' })).toHaveAttribute(
      'href',
      '/calendar/week?date=2026-06-22&panel=review',
    );
    expect(screen.getByRole('link', { name: /settings\.category\.profile/ })).toHaveAttribute(
      'href',
      '/settings/profile?returnTo=%2Fcalendar%2Fweek%3Fdate%3D2026-06-22%26panel%3Dreview',
    );
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

  it('preserves the mobile settings return path from category pages', () => {
    mockHasMounted = true;
    mockIsMobile = true;
    mockCategory = 'billing';
    mockSearchParams = new URLSearchParams('returnTo=%2Fja%2Fcalendar%2Fday%3Fdate%3D2026-06-22');

    render(<SettingsCategoryPage />);

    expect(screen.getByRole('link', { name: 'common.back' })).toHaveAttribute(
      'href',
      '/settings?returnTo=%2Fcalendar%2Fday%3Fdate%3D2026-06-22',
    );
  });
});
