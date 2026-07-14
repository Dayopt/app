import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLogout } from '../useLogout';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSignOut = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@dayopt/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns logout function and isLoggingOut state', () => {
    const { result } = renderHook(() => useLogout());
    expect(result.current.logout).toBeInstanceOf(Function);
    expect(result.current.isLoggingOut).toBe(false);
  });

  it('calls signOut and navigates to login on success', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/auth/login');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('sets isLoggingOut during the process', async () => {
    let resolveSignOut: () => void;
    mockSignOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );

    const { result } = renderHook(() => useLogout());

    act(() => {
      result.current.logout();
    });

    // During logout
    await waitFor(() => {
      expect(result.current.isLoggingOut).toBe(true);
    });

    // Resolve
    await act(async () => {
      resolveSignOut!();
    });

    expect(result.current.isLoggingOut).toBe(false);
  });

  it('handles signOut error gracefully', async () => {
    mockSignOut.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.logout();
    });

    // Should not navigate on error
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.isLoggingOut).toBe(false);
  });
});
