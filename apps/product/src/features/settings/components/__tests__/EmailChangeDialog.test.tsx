import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailChangeDialog } from '../EmailChangeDialog';

const mockUpdateUser = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      updateUser: mockUpdateUser,
    },
  }),
}));

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<EmailChangeDialog open onOpenChange={onOpenChange} currentEmail="current@example.com" />);
  return { onOpenChange };
}

async function submitNewEmail(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('newEmail'), 'new@example.com');
  await user.click(screen.getByRole('button', { name: 'submit' }));
}

describe('EmailChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('reaches updateUser with the new email and never calls signInWithPassword', async () => {
    const user = userEvent.setup();
    renderDialog();

    await submitNewEmail(user);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith(
        { email: 'new@example.com' },
        { emailRedirectTo: expect.stringContaining('/settings/account') },
      );
    });

    // #1917: 公開 Auth endpoint での再認証はしない。Bot Protection 有効時は CAPTCHA token を
    // 要求されて必ず失敗するため。本人確認は Secure Email Change が担う
    // （保証境界は docs/product/specs/auth.md）。
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  it('shows the success hint once the confirmation emails are sent', async () => {
    const user = userEvent.setup();
    renderDialog();

    await submitNewEmail(user);

    // 旧・新の両アドレスへ届くリンクを両方踏む必要がある旨を案内する
    await waitFor(() => {
      expect(screen.getByText('successHint')).toBeInTheDocument();
    });
  });

  it('surfaces a sanitized error when updateUser fails', async () => {
    const user = userEvent.setup();
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: new Error('captcha protection: request disallowed (no captcha_token found)'),
    });

    renderDialog();

    await submitNewEmail(user);

    // 生のエラーメッセージを出さず、OWASP 準拠のサニタイズ済みキーへ変換する。
    // 「パスワードが正しくありません」への誤変換が起きないことも同時に固定する。
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('auth.errors.unexpectedError');
    });
  });

  it('does not ask for the current password', () => {
    renderDialog();

    expect(screen.queryByLabelText('passwordConfirm')).not.toBeInTheDocument();
  });
});
