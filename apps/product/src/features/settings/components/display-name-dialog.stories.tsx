/**
 * DisplayNameDialog Stories
 *
 * 表示名変更ダイアログのストーリー。
 * Supabase を直接呼ぶため tRPC モック不要。
 * parameters.storeMocks でユーザー情報をモックする。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { PRESET_AUTH } from '@dayopt/storybook/mocks/presets';

import { DisplayNameDialog } from './display-name-dialog';

const meta = {
  title: 'Product/Features/Settings/DisplayNameDialog',
  component: DisplayNameDialog,
  parameters: {
    layout: 'centered',
    storeMocks: { useAuthStore: PRESET_AUTH.authenticated },
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    currentName: '山田 太郎',
  },
} satisfies Meta<typeof DisplayNameDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト：既存の表示名が入力済みの状態で開く。 */
export const Default: Story = {};

/** 空の表示名：入力が未記入でキャンセルのみ操作可能。 */
export const EmptyName: Story = {
  args: {
    currentName: '',
  },
};

/** 長い表示名：長い名前がインプットに収まる確認。 */
export const LongName: Story = {
  args: {
    currentName: 'Takayasu Tomoyuki Nakamura-Yamamoto',
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
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground text-xs">デフォルト（名前入力済み）</p>
      <DisplayNameDialog open onOpenChange={fn()} currentName="山田 太郎" />
    </div>
  ),
};
