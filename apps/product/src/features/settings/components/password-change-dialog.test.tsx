import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordChangeDialog } from './password-change-dialog';

const mockUpdateUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockCheckPasswordPwned = vi.fn();
const mockSendPasswordChangedEmail = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/features/auth', () => ({
  useAuthStore: (selector: (state: { user: { email: string } }) => unknown) =>
    selector({ user: { email: 'user@example.com' } }),
}));

vi.mock('@/lib/auth/pwned-password', () => ({
  checkPasswordPwned: (password: string) => mockCheckPasswordPwned(password),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      updateUser: mockUpdateUser,
    },
  }),
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    email: {
      sendPasswordChanged: {
        useMutation: () => ({ mutate: mockSendPasswordChangedEmail }),
      },
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/user', () => ({
  getDisplayName: () => 'User',
}));

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<PasswordChangeDialog open onOpenChange={onOpenChange} />);
  return { onOpenChange };
}

describe('PasswordChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPasswordPwned.mockResolvedValue(false);
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it('verifies the current password and updates password with current_password', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('settings.account.currentPassword'), 'old-password');
    await user.type(screen.getByLabelText('settings.account.newPassword'), 'new-password-1');
    await user.type(screen.getByLabelText('settings.account.confirmPassword'), 'new-password-1');
    await user.click(screen.getByRole('button', { name: 'settings.account.updatePassword' }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'old-password',
      });
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: 'new-password-1',
        current_password: 'old-password',
      });
    });

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(mockSendPasswordChangedEmail).toHaveBeenCalledWith({
      email: 'user@example.com',
      userName: 'User',
    });
  });

  it('shows the current password error when Supabase rejects current_password', async () => {
    const user = userEvent.setup();
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Current password is incorrect'),
    });

    renderDialog();

    await user.type(screen.getByLabelText('settings.account.currentPassword'), 'wrong-password');
    await user.type(screen.getByLabelText('settings.account.newPassword'), 'new-password-1');
    await user.type(screen.getByLabelText('settings.account.confirmPassword'), 'new-password-1');
    await user.click(screen.getByRole('button', { name: 'settings.account.updatePassword' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('settings.account.passwordIncorrect');
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSendPasswordChangedEmail).not.toHaveBeenCalled();
  });

  it('does not update the password when explicit current password verification fails', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid login credentials'),
    });

    renderDialog();

    await user.type(screen.getByLabelText('settings.account.currentPassword'), 'wrong-password');
    await user.type(screen.getByLabelText('settings.account.newPassword'), 'new-password-1');
    await user.type(screen.getByLabelText('settings.account.confirmPassword'), 'new-password-1');
    await user.click(screen.getByRole('button', { name: 'settings.account.updatePassword' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('settings.account.passwordIncorrect');
    });

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSendPasswordChangedEmail).not.toHaveBeenCalled();
  });
});
