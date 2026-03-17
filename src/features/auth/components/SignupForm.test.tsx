import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignupForm } from './SignupForm';

// シンプルなレンダリングヘルパー（TooltipProviderは不要になった）
function renderWithProviders(ui: React.ReactElement) {
  return render(ui);
}

// モックの設定
const mockPush = vi.fn();
const mockSignUp = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'ja' }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/platform/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
      React.createElement('a', { href, ...props }, children),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/',
  };
});

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { signUp: typeof mockSignUp }) => typeof mockSignUp) =>
    selector({ signUp: mockSignUp }),
}));

// パスワードチェックのモック（オプショナル機能）
vi.mock('@/platform/auth/pwned-password', () => ({
  checkPasswordPwned: vi.fn().mockResolvedValue(false),
}));

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('フォームが正しくレンダリングされる', () => {
      renderWithProviders(<SignupForm />);

      expect(screen.getByRole('heading')).toBeInTheDocument();
      expect(screen.getByLabelText(/auth\.signupForm\.email/)).toBeInTheDocument();
      expect(screen.getByLabelText(/auth\.signupForm\.password/)).toBeInTheDocument();
      expect(screen.getByLabelText(/auth\.signupForm\.confirmPassword/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'auth.signupForm.createAccountButton' }),
      ).toBeInTheDocument();
    });

    it('メール、パスワード、確認パスワードが入力可能', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SignupForm />);

      const emailInput = screen.getByLabelText(/auth\.signupForm\.email/);
      const passwordInput = screen.getByLabelText(/auth\.signupForm\.password/);
      const confirmInput = screen.getByLabelText(/auth\.signupForm\.confirmPassword/);

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.type(confirmInput, 'password123');

      expect(emailInput).toHaveValue('test@example.com');
      expect(passwordInput).toHaveValue('password123');
      expect(confirmInput).toHaveValue('password123');
    });

    it('利用規約チェックボックスが存在する', () => {
      renderWithProviders(<SignupForm />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    // DADS準拠: バリデーションは送信時に行われる（リアルタイムインジケーターは削除）

    it('パスワードが一致しない場合エラーが表示される', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SignupForm />);

      await user.type(screen.getByLabelText(/auth\.signupForm\.email/), 'test@example.com');
      await user.type(screen.getByLabelText(/auth\.signupForm\.password/), 'password1');
      await user.type(screen.getByLabelText(/auth\.signupForm\.confirmPassword/), 'password2');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'auth.signupForm.createAccountButton' }));

      // onSubmitバリデーション: Zodスキーマからのハードコードメッセージ（FieldErrorが「＊」prefix付与）
      const errorElement = await screen.findByText(
        (content) => content.includes('パスワードが一致しません'),
        {},
        { timeout: 3000 },
      );
      expect(errorElement).toBeInTheDocument();

      // パスワード不一致ではサインアップは呼ばれない
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('送信ボタンは常に有効（DADS準拠）', () => {
      renderWithProviders(<SignupForm />);

      const submitButton = screen.getByRole('button', {
        name: 'auth.signupForm.createAccountButton',
      });
      // DADS準拠: ボタンは常に有効で、バリデーションは送信時に行う
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('フォーム送信', () => {
    it('サインアップ成功時にカレンダーページへ遷移する', async () => {
      const user = userEvent.setup();
      mockSignUp.mockResolvedValue({
        data: { user: { id: '123' }, session: {} },
        error: null,
      });

      renderWithProviders(<SignupForm />);

      await user.type(screen.getByLabelText(/auth\.signupForm\.email/), 'test@example.com');
      await user.type(screen.getByLabelText(/auth\.signupForm\.password/), 'password1');
      await user.type(screen.getByLabelText(/auth\.signupForm\.confirmPassword/), 'password1');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'auth.signupForm.createAccountButton' }));

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'password1');
        expect(mockPush).toHaveBeenCalledWith('/ja/calendar/day');
      });
    });

    it('サインアップ失敗時にエラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'Email already exists' },
      });

      renderWithProviders(<SignupForm />);

      await user.type(screen.getByLabelText(/auth\.signupForm\.email/), 'existing@example.com');
      await user.type(screen.getByLabelText(/auth\.signupForm\.password/), 'password1');
      await user.type(screen.getByLabelText(/auth\.signupForm\.confirmPassword/), 'password1');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'auth.signupForm.createAccountButton' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('auth.errors.unexpectedError');
      });
    });

    it('送信中はスピナーが表示される', async () => {
      const user = userEvent.setup();
      mockSignUp.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: { user: {}, session: {} }, error: null }), 100),
          ),
      );

      renderWithProviders(<SignupForm />);

      await user.type(screen.getByLabelText(/auth\.signupForm\.email/), 'test@example.com');
      await user.type(screen.getByLabelText(/auth\.signupForm\.password/), 'password1');
      await user.type(screen.getByLabelText(/auth\.signupForm\.confirmPassword/), 'password1');
      await user.click(screen.getByRole('checkbox'));

      const submitButton = screen.getByRole('button', {
        name: 'auth.signupForm.createAccountButton',
      });
      await user.click(submitButton);

      // 送信中はスピナーが表示される
      await waitFor(() => {
        expect(submitButton.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  describe('パスワード表示切替', () => {
    it('パスワードフィールドの表示切替が機能する', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SignupForm />);

      const passwordInput = screen.getByLabelText(/auth\.signupForm\.password/);
      expect(passwordInput).toHaveAttribute('type', 'password');

      // パスワード入力欄の親要素内にあるボタンを取得
      const passwordContainer = passwordInput.closest('.relative');
      const toggleButton = passwordContainer?.querySelector('button');
      expect(toggleButton).toBeTruthy();

      await user.click(toggleButton!);

      expect(passwordInput).toHaveAttribute('type', 'text');
    });

    it('確認パスワードフィールドの表示切替が機能する', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SignupForm />);

      const confirmInput = screen.getByLabelText(/auth\.signupForm\.confirmPassword/);
      expect(confirmInput).toHaveAttribute('type', 'password');

      // 確認パスワード入力欄の親要素内にあるボタンを取得
      const confirmContainer = confirmInput.closest('.relative');
      const toggleButton = confirmContainer?.querySelector('button');
      expect(toggleButton).toBeTruthy();

      await user.click(toggleButton!);

      expect(confirmInput).toHaveAttribute('type', 'text');
    });
  });

  describe('グレースフルデグラデーション', () => {
    it('パスワードチェックAPIが失敗してもサインアップ可能', async () => {
      const user = userEvent.setup();

      // パスワードチェックが例外を投げる状態をシミュレート
      const { checkPasswordPwned } = await import('@/platform/auth/pwned-password');
      vi.mocked(checkPasswordPwned).mockRejectedValueOnce(new Error('API Error'));

      mockSignUp.mockResolvedValue({
        data: { user: { id: '123' }, session: {} },
        error: null,
      });

      renderWithProviders(<SignupForm />);

      await user.type(screen.getByLabelText(/auth\.signupForm\.email/), 'test@example.com');
      await user.type(screen.getByLabelText(/auth\.signupForm\.password/), 'password1');
      await user.type(screen.getByLabelText(/auth\.signupForm\.confirmPassword/), 'password1');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'auth.signupForm.createAccountButton' }));

      // APIエラーでもサインアップは続行される
      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalled();
      });
    });

    it('漏洩パスワード検出時はエラーが表示される', async () => {
      const user = userEvent.setup();

      const { checkPasswordPwned } = await import('@/platform/auth/pwned-password');
      vi.mocked(checkPasswordPwned).mockResolvedValueOnce(true);

      renderWithProviders(<SignupForm />);

      await user.type(screen.getByLabelText(/auth\.signupForm\.email/), 'test@example.com');
      await user.type(screen.getByLabelText(/auth\.signupForm\.password/), 'password1');
      await user.type(screen.getByLabelText(/auth\.signupForm\.confirmPassword/), 'password1');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'auth.signupForm.createAccountButton' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('auth.errors.pwnedPassword');
      });

      // サインアップは呼ばれない
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });
});
