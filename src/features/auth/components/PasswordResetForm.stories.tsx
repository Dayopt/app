import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError, FieldGroup } from '@/components/ui/field';
import { Link } from '@/platform/i18n/navigation';

import { PasswordResetForm } from './PasswordResetForm';

/** PasswordResetForm - パスワードリセット依頼フォーム */
const meta = {
  title: 'Features/Auth/PasswordResetForm',
  component: PasswordResetForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PasswordResetForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Visual Variants
// ─────────────────────────────────────────────────────────

function PasswordResetSuccessExample() {
  const [email] = useState('user@example.com');

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Check your email</h1>
                <p className="text-muted-foreground text-balance">
                  We sent a password reset link to <span className="font-normal">{email}</span>
                </p>
              </div>
              <Button asChild>
                <Link href="/auth/login">Back to login</Link>
              </Button>
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

/** デフォルト表示 */
export const Default: Story = {};

/** メール入力の操作テスト */
export const WithInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const emailInput = canvas.getByLabelText(/メールアドレス/i);
    await userEvent.type(emailInput, 'forgot@example.com');
    await expect(emailInput).toHaveValue('forgot@example.com');
  },
};

/** リセットリンク送信完了 */
export const Success: Story = {
  render: () => <PasswordResetSuccessExample />,
};

/** エラーメッセージ一覧 */
export const ErrorMessages: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <p className="text-muted-foreground text-sm font-medium">
        PasswordResetForm エラーバリエーション
      </p>
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
      <PasswordResetForm />
      <p className="text-muted-foreground mb-3 text-xs font-medium">Success</p>
      <PasswordResetSuccessExample />
      <p className="text-muted-foreground mb-3 text-xs font-medium">ErrorMessages</p>
      <div className="flex max-w-md flex-col gap-4 p-6">
        <FieldError announceImmediately className="text-center">
          問題が発生しました。時間をおいて再度お試しください。
        </FieldError>
      </div>
    </div>
  ),
};
