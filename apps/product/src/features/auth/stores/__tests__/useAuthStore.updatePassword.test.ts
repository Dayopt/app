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

  // risk-reviewer 指摘: observeAuthOperation は catch した例外を re-throw する契約
  // （lib/sentry/integration.ts）。signOut の失敗を握り潰さないと、外側の try/catch に
  // 落ちて「パスワード更新は成功しているのに失敗として返る」誤報告になる。
  it('signOut が失敗しても更新成功の結果は失敗に変わらない', async () => {
    const updateResult = { data: { user: { id: 'user-1' } }, error: null };
    mockUpdateUser.mockResolvedValue(updateResult);
    mockSignOut.mockRejectedValue(new Error('network error'));

    const result = await useAuthStore.getState().updatePassword('NewPassw0rd!23');

    expect(result).toEqual(updateResult);
    expect(useAuthStore.getState().error).toBeNull();
  });
});
