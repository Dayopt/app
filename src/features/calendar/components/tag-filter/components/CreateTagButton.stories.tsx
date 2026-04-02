import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CreateTagButton } from './CreateTagButton';

/**
 * タグ作成ボタン（フィルターリスト右上の「＋」ボタン）。
 * クリックするとタグ作成モーダルが開く。
 */
const meta = {
  title: 'Features/Calendar/Sidebar/TagFilter/CreateTagButton',
  component: CreateTagButton,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof CreateTagButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト。＋アイコンボタン。ホバーで背景色が変わる。 */
export const Default: Story = {};

/** フィルターリストのヘッダー内での表示コンテキスト。 */
export const InContext: Story = {
  render: () => (
    <div className="border-border flex w-48 items-center justify-between rounded-lg border px-2 py-1">
      <span className="text-foreground text-sm">タグ</span>
      <CreateTagButton />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">単体</p>
        <CreateTagButton />
      </div>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">ヘッダー内コンテキスト</p>
        <div className="border-border flex w-48 items-center justify-between rounded-lg border px-2 py-1">
          <span className="text-foreground text-sm">タグ</span>
          <CreateTagButton />
        </div>
      </div>
    </div>
  ),
};
