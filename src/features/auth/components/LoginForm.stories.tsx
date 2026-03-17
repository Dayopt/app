import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { FieldError } from '@/components/ui/field';

import { LoginForm } from './LoginForm';

/** LoginForm - ログインフォーム */
const meta = {
  title: 'Features/Auth/LoginForm',
  component: LoginForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs', 'critical'],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示 */
export const Default: Story = {};

/** フォーム入力の操作テスト */
export const WithInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // メール入力（id="email"）
    const emailInput = canvas.getByRole('textbox', { name: /メールアドレス/ });
    await userEvent.type(emailInput, 'user@example.com');
    await expect(emailInput).toHaveValue('user@example.com');

    // パスワード入力（id="password"）
    const passwordInput = canvasElement.querySelector<HTMLInputElement>('#password');
    await expect(passwordInput).not.toBeNull();
    await userEvent.type(passwordInput!, 'SecureP@ss123');
    await expect(passwordInput).toHaveValue('SecureP@ss123');
  },
};

/** パスワード表示トグル */
export const PasswordToggle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // パスワード入力（id="password"）
    const passwordInput = canvasElement.querySelector<HTMLInputElement>('#password');
    await expect(passwordInput).not.toBeNull();
    await userEvent.type(passwordInput!, 'TestPassword');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // トグルボタンクリック
    const toggleButton = canvas.getByRole('button', { name: /パスワードを表示/i });
    await userEvent.click(toggleButton);
    await expect(passwordInput).toHaveAttribute('type', 'text');
  },
};

/** エラーメッセージ一覧 */
export const ErrorMessages: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <p className="text-muted-foreground text-sm font-medium">LoginForm エラーバリエーション</p>
      <FieldError announceImmediately className="text-center">
        メールアドレスまたはパスワードが正しくありません
      </FieldError>
      <FieldError announceImmediately className="text-center">
        セキュリティのため、このアカウントは一時的にロックされています。15分後に再試行してください。
      </FieldError>
      <FieldError announceImmediately className="text-center">
        問題が発生しました。時間をおいて再度お試しください。
      </FieldError>
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground mb-3 text-xs font-medium">Default</p>
      <LoginForm />
      <p className="text-muted-foreground mb-3 text-xs font-medium">ErrorMessages</p>
      <div className="flex max-w-md flex-col gap-4 p-6">
        <FieldError announceImmediately className="text-center">
          メールアドレスまたはパスワードが正しくありません
        </FieldError>
        <FieldError announceImmediately className="text-center">
          セキュリティのため、このアカウントは一時的にロックされています。15分後に再試行してください。
        </FieldError>
        <FieldError announceImmediately className="text-center">
          問題が発生しました。時間をおいて再度お試しください。
        </FieldError>
      </div>
    </div>
  ),
};
