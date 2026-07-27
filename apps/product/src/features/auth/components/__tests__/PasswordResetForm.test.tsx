import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordResetForm } from '../PasswordResetForm';

const mockResetPassword = vi.fn();
const mockTurnstileReset = vi.fn();
let mockTurnstileEnabled = true;

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'ja' }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@dayopt/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
      React.createElement('a', { href, ...props }, children),
  };
});

vi.mock('@/features/auth/stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { resetPassword: typeof mockResetPassword }) => unknown) =>
    selector({ resetPassword: mockResetPassword }),
}));

// Turnstile widget は onSuccess でトークンを返すだけの最小モックにする。
// ref.reset() が呼ばれることも検証したいので imperative handle を持たせる。
vi.mock('@/lib/turnstile', async () => {
  const React = await import('react');
  const MockTurnstile = React.forwardRef(
    ({ onSuccess }: { onSuccess: (token: string) => void }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ reset: mockTurnstileReset }));
      return React.createElement(
        'button',
        { type: 'button', onClick: () => onSuccess('test-captcha-token') },
        'solve-captcha',
      );
    },
  );
  MockTurnstile.displayName = 'MockTurnstile';

  return {
    isTurnstileEnabled: () => mockTurnstileEnabled,
    Turnstile: MockTurnstile,
  };
});

describe('PasswordResetForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTurnstileEnabled = true;
    mockResetPassword.mockResolvedValue({ error: null });
  });

  it('captcha を解いてから送信すると captchaToken を渡す', async () => {
    const user = userEvent.setup();
    render(<PasswordResetForm />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'solve-captcha' }));
    await user.click(screen.getByRole('button', { name: /sendResetLink/i }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('user@example.com', {
        captchaToken: 'test-captcha-token',
      });
    });
  });

  it('captcha が未解決なら送信ボタンを押せない（token 無しで /recover を叩かない）', async () => {
    const user = userEvent.setup();
    render(<PasswordResetForm />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');

    expect(screen.getByRole('button', { name: /sendResetLink/i })).toBeDisabled();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('送信に失敗したら token を捨てて widget を reset する', async () => {
    mockResetPassword.mockResolvedValue({ error: { message: 'boom' } });
    const user = userEvent.setup();
    render(<PasswordResetForm />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'solve-captcha' }));
    await user.click(screen.getByRole('button', { name: /sendResetLink/i }));

    await waitFor(() => expect(mockTurnstileReset).toHaveBeenCalled());
    // single-use token を再利用しないよう、送信ボタンは再び disabled に戻る
    expect(screen.getByRole('button', { name: /sendResetLink/i })).toBeDisabled();
  });

  it('Turnstile 無効の環境では captchaToken を渡さず送信できる', async () => {
    mockTurnstileEnabled = false;
    const user = userEvent.setup();
    render(<PasswordResetForm />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /sendResetLink/i }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('user@example.com');
    });
  });
});
