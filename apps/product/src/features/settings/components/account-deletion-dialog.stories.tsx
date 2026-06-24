/**
 * AccountDeletionDialog Stories
 *
 * アカウント削除確認ダイアログのストーリー。
 * コンポーネントが内部で isOpen state を管理する。
 * tRPC モックは preview.tsx の TRPCMockProvider で提供される。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AccountDeletionDialog } from './account-deletion-dialog';

const meta = {
  title: 'Product/Features/Settings/AccountDeletionDialog',
  component: AccountDeletionDialog,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AccountDeletionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト：アカウント削除ボタンを含む LabeledRow と、
 * ボタンクリックで AlertDialog が開く状態。
 */
export const Default: Story = {};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl">
      <AccountDeletionDialog />
    </div>
  ),
};
