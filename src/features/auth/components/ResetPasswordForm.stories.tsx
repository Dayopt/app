import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Check, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { HoverTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { Link } from '@/platform/i18n/navigation';

import { ResetPasswordForm } from './ResetPasswordForm';

/** ResetPasswordForm - パスワードリセットフォーム（メールリンク経由） */
const meta = {
  title: 'Features/Auth/ResetPasswordForm',
  component: ResetPasswordForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ResetPasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Visual Variants (store非依存のモック)
// ─────────────────────────────────────────────────────────

function ResetPasswordFormWithError() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={(e) => e.preventDefault()}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Set new password</h1>
                <p className="text-muted-foreground text-balance">Enter your new password below</p>
              </div>

              <FieldError announceImmediately className="text-center">
                パスワードが一致しません
              </FieldError>

              <Field>
                <FieldLabel htmlFor="password-error">New password</FieldLabel>
                <div className="relative">
                  <Input
                    id="password-error"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                  <HoverTooltip
                    content={showPassword ? 'Hide password' : 'Show password'}
                    side="top"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      icon
                      className="absolute top-0 right-0 h-full px-4"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </HoverTooltip>
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword-error">Confirm password</FieldLabel>
                <div className="relative">
                  <Input
                    id="confirmPassword-error"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                  />
                  <HoverTooltip
                    content={showConfirmPassword ? 'Hide password' : 'Show password'}
                    side="top"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      icon
                      className="absolute top-0 right-0 h-full px-4"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </HoverTooltip>
                </div>
              </Field>

              <Field>
                <Button type="submit" className="w-full">
                  Update password
                </Button>
              </Field>

              <FieldDescription className="text-center">
                <Link href="/auth/login">Back to login</Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-container relative hidden md:block" />
        </CardContent>
      </Card>
    </div>
  );
}

function ResetPasswordFormSuccess() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-state-active text-state-active-foreground mb-2 flex h-12 w-12 items-center justify-center rounded-full">
                  <Check className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold">Password updated!</h1>
                <p className="text-muted-foreground text-balance">
                  Your password has been updated. Redirecting to login...
                </p>
              </div>
            </FieldGroup>
          </div>
          <div className="bg-container relative hidden md:block" />
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示（フォーム状態） */
export const Default: Story = {
  render: () => <ResetPasswordForm />,
};

/** パスワード入力の操作テスト */
export const WithInteraction: Story = {
  render: () => <ResetPasswordForm />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // パスワード入力
    const passwordInput = canvas.getByLabelText(/新しいパスワード/i);
    await userEvent.type(passwordInput, 'SecureP@ss123');

    // 確認パスワード入力
    const confirmInput = canvas.getByLabelText(/パスワード確認/i);
    await userEvent.type(confirmInput, 'SecureP@ss123');

    // 入力されていることを確認
    await expect(passwordInput).toHaveValue('SecureP@ss123');
    await expect(confirmInput).toHaveValue('SecureP@ss123');
  },
};

/** エラー表示（パスワード不一致） */
export const Error: Story = {
  render: () => <ResetPasswordFormWithError />,
};

/** 成功状態 */
export const Success: Story = {
  render: () => <ResetPasswordFormSuccess />,
};

/** エラーメッセージ一覧 */
export const ErrorMessages: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <p className="text-muted-foreground text-sm font-medium">
        ResetPasswordForm エラーバリエーション
      </p>
      <FieldError announceImmediately className="text-center">
        パスワードが一致しません
      </FieldError>
      <FieldError announceImmediately className="text-center">
        パスワードは8文字以上である必要があります
      </FieldError>
      <FieldError announceImmediately className="text-center">
        問題が発生しました。時間をおいて再度お試しください。
      </FieldError>
    </div>
  ),
};

/** 全パターン */
export const AllPatterns: Story = {
  render: () => (
    <div className={cn('flex flex-col items-start gap-8')}>
      <div>
        <p className="text-muted-foreground mb-2 text-sm font-medium">Default</p>
        <ResetPasswordForm />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-sm font-medium">Error</p>
        <ResetPasswordFormWithError />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-sm font-medium">Success</p>
        <ResetPasswordFormSuccess />
      </div>
    </div>
  ),
};
