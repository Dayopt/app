/**
 * BlockItem Stories
 *
 * ブロックアイテム（Palette・RecentBlocks 共通）。
 * タグカラードット + タグ名 + duration。menuSlot でホバー時メニューを注入可能。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { BlockItem } from './BlockItem';

const meta = {
  title: 'Components/Shell/Sidebar/BlockItem',
  component: BlockItem,
  parameters: { layout: 'padded' },
  args: {
    onClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof BlockItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 基本的なブロックアイテム。 */
export const Default: Story = {
  args: {
    tagName: '仕事',
    tagColor: 'blue',
    durationMinutes: 60,
  },
};

/** 短い duration（15分）。 */
export const ShortDuration: Story = {
  args: {
    tagName: '休憩',
    tagColor: 'amber',
    durationMinutes: 15,
  },
};

/** 長いタグ名（truncate 確認用）。 */
export const LongName: Story = {
  args: {
    tagName: 'プロジェクト管理・定例ミーティング準備',
    tagColor: 'indigo',
    durationMinutes: 90,
  },
};

/** タグ色なし（フォールバック）。 */
export const NoColor: Story = {
  args: {
    tagName: '未分類',
    tagColor: null,
    durationMinutes: 30,
  },
};

/** カスタム menuSlot を渡した場合。 */
export const WithMenuSlot: Story = {
  args: {
    tagName: '勉強',
    tagColor: 'green',
    durationMinutes: 45,
    menuSlot: (
      <button
        type="button"
        className="text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded text-xs"
        aria-label="Custom menu"
      >
        ⋯
      </button>
    ),
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    tagName: '',
    tagColor: null,
    durationMinutes: 0,
  },
  render: () => (
    <div className="w-64 space-y-1">
      <BlockItem tagName="仕事" tagColor="blue" durationMinutes={60} onClick={fn()} />
      <BlockItem tagName="勉強" tagColor="green" durationMinutes={30} onClick={fn()} />
      <BlockItem tagName="運動" tagColor="amber" durationMinutes={45} onClick={fn()} />
      <BlockItem
        tagName="プロジェクト管理・定例ミーティング準備"
        tagColor="indigo"
        durationMinutes={90}
        onClick={fn()}
      />
      <BlockItem tagName="休憩" tagColor="orange" durationMinutes={15} onClick={fn()} />
      <BlockItem tagName="未分類" tagColor={null} durationMinutes={30} onClick={fn()} />
    </div>
  ),
};
