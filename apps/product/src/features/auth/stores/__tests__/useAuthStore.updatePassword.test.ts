import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  }),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedAuthError: vi.fn(),
  observeAuthOperation: (_name: string, operation: () => unknown) => operation(),
}));

import { useAuthStore } from '../useAuthStore';

describe('useAuthStore.updatePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  // #1928 Fix4: recovery でパスワードを変更した後、他端末の session を失効させる。
  // アカウント乗っ取り被害者が復旧しても攻撃者の refresh token が生き残る欠陥への対処。
  it('更新成功時は他端末の session を signOut する', async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: {} }, error: null });

    await useAuthStore.getState().updatePassword('NewPassw0rd!23');

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('更新失敗時は signOut を呼ばない', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('rejected'), { code: 'insufficient_aal' }),
    });

    await useAuthStore.getState().updatePassword('NewPassw0rd!23');

    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
