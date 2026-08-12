import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetPasswordForm } from '../ResetPasswordForm';

const mockUpdatePassword = vi.fn();
const mockPush = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'ja' }),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@dayopt/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
      React.createElement('a', { href, ...props }, children),
  };
});

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { updatePassword: typeof mockUpdatePassword }) => unknown) =>
    selector({ updatePassword: mockUpdatePassword }),
}));

function renderForm() {
  return render(<ResetPasswordForm />);
}

async function submitValidPassword() {
  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText('auth.resetPasswordForm.newPassword'), 'NewPassw0rd!23');
  await user.type(
    screen.getByLabelText('auth.resetPasswordForm.confirmPassword'),
    'NewPassw0rd!23',
  );
  await user.click(screen.getByRole('button', { name: 'auth.resetPasswordForm.updateButton' }));
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // #1928: 通過側。recovery session からの正常な更新は従来どおり成功画面へ遷移する。
  it('通常の recovery session からの更新は成功画面へ遷移する', async () => {
    mockUpdatePassword.mockResolvedValue({ data: { user: null }, error: null });

    await submitValidPassword();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'auth.resetPasswordForm.successTitle',
      );
    });
  });

  // #1928 A1: ブロック側。MFA(TOTP) 有効アカウントの recovery session は GoTrue が
  // config に関わらず insufficient_aal で拒否する。汎用「時間をおいて再試行」は
  // 再試行しても直らないため、MFA 専用の actionable message を出す。
  it('insufficient_aal は MFA 専用メッセージを表示する', async () => {
    mockUpdatePassword.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('AAL2 session is required'), { code: 'insufficient_aal' }),
    });

    await submitValidPassword();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('auth.errors.recoveryMfaBlocked');
    });
  });

  // ブロック側: recovery session でないセッション（直接アクセス等）で current_password_required
  // が返った場合は、セッション再取得を促すメッセージを出す。
  it.each([
    'current_password_required',
    'current_password_invalid',
    'invalid_credentials',
    'reauthentication_needed',
  ])('%s はセッション再取得を促すメッセージを表示する', async (code) => {
    mockUpdatePassword.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('rejected'), { code }),
    });

    await submitValidPassword();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('auth.errors.recoverySessionInvalid');
    });
  });

  // 既存挙動の固定: 構造化 code を持たない・未知の code のエラーは従来どおり
  // getAuthErrorKey の汎用判定（message の weak/short 判定）にフォールバックする。
  it('未知の code は従来どおり汎用エラー判定にフォールバックする', async () => {
    mockUpdatePassword.mockResolvedValue({
      data: { user: null },
      error: new Error('some unexpected failure'),
    });

    await submitValidPassword();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('auth.errors.unexpectedError');
    });
  });
});
