/**
 * PaletteItem Stories
 *
 * パレット内の個別ブロック表示。
 * タグカラードット + タグ名 + durationバッジ + ピンアイコンの各バリエーション。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { PaletteItem } from './PaletteItem';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Palette/PaletteItem',
  component: PaletteItem,
  parameters: { layout: 'padded' },
  args: {
    onClick: fn(),
    tooltipContent: 'Add at current time',
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PaletteItem>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 通常アイテム（自動浮上） */
export const Default: Story = {
  args: {
    tagName: '仕事',
    tagColor: 'blue',
    durationMinutes: 60,
    isPinned: false,
  },
};

/** ピン留めアイテム */
export const Pinned: Story = {
  args: {
    tagName: '勉強',
    tagColor: 'green',
    durationMinutes: 30,
    isPinned: true,
  },
};

/** 長いタグ名（truncate確認） */
export const LongName: Story = {
  args: {
    tagName: 'プロジェクト管理・定例ミーティング準備',
    tagColor: 'indigo',
    durationMinutes: 90,
    isPinned: true,
  },
};

/** 短い duration */
export const ShortDuration: Story = {
  args: {
    tagName: '休憩',
    tagColor: 'amber',
    durationMinutes: 15,
    isPinned: false,
  },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  args: {
    tagName: '',
    tagColor: null,
    durationMinutes: 0,
    isPinned: false,
    onClick: fn(),
    tooltipContent: 'Add at current time',
  },
  render: () => (
    <div className="w-64 space-y-1">
      <PaletteItem
        tagName="仕事"
        tagColor="blue"
        durationMinutes={60}
        isPinned
        onClick={fn()}
        tooltipContent="Add at current time"
      />
      <PaletteItem
        tagName="勉強"
        tagColor="green"
        durationMinutes={30}
        isPinned
        onClick={fn()}
        tooltipContent="Add at current time"
      />
      <PaletteItem
        tagName="運動"
        tagColor="amber"
        durationMinutes={45}
        isPinned={false}
        onClick={fn()}
        tooltipContent="Add at current time"
      />
      <PaletteItem
        tagName="プロジェクト管理・定例ミーティング準備"
        tagColor="indigo"
        durationMinutes={90}
        isPinned={false}
        onClick={fn()}
        tooltipContent="Add at current time"
      />
      <PaletteItem
        tagName="休憩"
        tagColor="orange"
        durationMinutes={15}
        isPinned={false}
        onClick={fn()}
        tooltipContent="Add at current time"
      />
    </div>
  ),
};
