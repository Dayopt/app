/**
 * EmailChangeDialog Stories
 *
 * メールアドレス変更ダイアログのストーリー。
 * Supabase Auth を直接呼ぶため、内部状態でUIの各フェーズを表現する。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@/components/ui/button';

import { EmailChangeDialog } from './email-change-dialog';

const meta = {
  title: 'Features/Settings/EmailChangeDialog',
  component: EmailChangeDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    currentEmail: 'current@example.com',
  },
} satisfies Meta<typeof EmailChangeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function InteractiveEmailChangeDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>メールアドレス変更</Button>
      <EmailChangeDialog open={open} onOpenChange={setOpen} currentEmail="current@example.com" />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ボタンクリックでダイアログを開く。 */
export const Default: Story = {
  args: { open: false },
  render: () => <InteractiveEmailChangeDialog />,
};

/** 初期フォーム状態（入力欄が空）。 */
export const EmptyForm: Story = {};

/** 閉じた状態：open=false でダイアログが非表示。 */
export const Closed: Story = {
  args: {
    open: false,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground text-xs">初期フォーム（空入力）</p>
      <EmailChangeDialog open onOpenChange={fn()} currentEmail="current@example.com" />
    </div>
  ),
};
