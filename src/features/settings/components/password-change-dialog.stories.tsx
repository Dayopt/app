/**
 * PasswordChangeDialog Stories
 *
 * パスワード変更ダイアログのストーリー。
 * OWASP/NIST推奨のセキュリティチェックを含む。
 * useAuthStore.setState でユーザー情報をモックする。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/useAuthStore';

import { PasswordChangeDialog } from './password-change-dialog';

const meta = {
  title: 'Features/Settings/PasswordChangeDialog',
  component: PasswordChangeDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
  },
  decorators: [
    (Story) => {
      useAuthStore.setState({
        user: { id: 'mock-user-id', email: 'user@example.com' } as never,
      });
      return <Story />;
    },
  ],
} satisfies Meta<typeof PasswordChangeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function InteractivePasswordChangeDialog() {
  const [open, setOpen] = useState(false);

  useAuthStore.setState({
    user: { id: 'mock-user-id', email: 'user@example.com' } as never,
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>パスワード変更</Button>
      <PasswordChangeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ボタンクリックでダイアログを開く。 */
export const Default: Story = {
  args: { open: false },
  render: () => <InteractivePasswordChangeDialog />,
};

/** 初期フォーム状態（入力欄が空）。現在のパスワード・新しいパスワード・確認の3フィールド。 */
export const EmptyForm: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
};

/** 閉じた状態：open=false でダイアログが非表示。 */
export const Closed: Story = {
  args: {
    open: false,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => {
    useAuthStore.setState({
      user: { id: 'mock-user-id', email: 'user@example.com' } as never,
    });
    return (
      <div className="flex flex-col items-start gap-6">
        <p className="text-muted-foreground text-xs">初期フォーム（パスワード入力欄3つ）</p>
        <PasswordChangeDialog open onOpenChange={fn()} />
      </div>
    );
  },
};
