/**
 * AvatarChangeDialog Stories
 *
 * アバター変更ダイアログのストーリー。
 * Supabase Storage を直接呼ぶため、parameters.storeMocks でユーザー情報をモックする。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { Button } from '@dayopt/components';

import { PRESET_AUTH } from '@dayopt/storybook/mocks/presets';

import { AvatarChangeDialog } from './avatar-change-dialog';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const AUTH_WITH_AVATAR = {
  user: {
    id: 'mock-user-id',
    email: 'user@example.com',
    user_metadata: {
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=storybook',
    },
  } as never,
  loading: false,
  error: null,
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/AvatarChangeDialog',
  component: AvatarChangeDialog,
  parameters: {
    layout: 'centered',
    storeMocks: { useAuthStore: PRESET_AUTH.authenticated },
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof AvatarChangeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Interactive Wrapper
// ─────────────────────────────────────────────────────────

function InteractiveAvatarChangeDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>アバター変更</Button>
      <AvatarChangeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** ボタンクリックでダイアログを開く。 */
export const Default: Story = {
  args: { open: false },
  render: () => <InteractiveAvatarChangeDialog />,
};

/** アバター未設定状態：AvatarUpload が空プレースホルダーを表示。 */
export const NoAvatar: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
};

/** アバター設定済み状態：既存のアバター画像が表示される。 */
export const WithAvatar: Story = {
  parameters: {
    a11y: { test: 'todo' },
    storeMocks: { useAuthStore: AUTH_WITH_AVATAR },
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
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground text-xs">アバター未設定</p>
      <AvatarChangeDialog open onOpenChange={fn()} />
    </div>
  ),
};
