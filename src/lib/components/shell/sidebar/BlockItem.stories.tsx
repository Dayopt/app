/**
 * BlockItem Stories
 *
 * ブロックアイテム（Palette）。
 * タグアイコン + タグ名 + duration。menuSlot でホバー時メニューを注入可能。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TagIcon } from '@/features/tags';

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
    iconSlot: <TagIcon icon="briefcase" color="blue" size="sm" />,
    durationMinutes: 60,
  },
};

/** 短い duration（15分）。 */
export const ShortDuration: Story = {
  args: {
    tagName: '休憩',
    iconSlot: <TagIcon icon="coffee" color="amber" size="sm" />,
    durationMinutes: 15,
  },
};

/** 長いタグ名（truncate 確認用）。 */
export const LongName: Story = {
  args: {
    tagName: 'プロジェクト管理・定例ミーティング準備',
    iconSlot: <TagIcon icon="calendar" color="indigo" size="sm" />,
    durationMinutes: 90,
  },
};

/** アイコン未設定（デフォルトアイコンにフォールバック）。 */
export const NoIcon: Story = {
  args: {
    tagName: '未分類',
    iconSlot: <TagIcon icon={null} color={null} size="sm" />,
    durationMinutes: 30,
  },
};

/** カスタム menuSlot を渡した場合。 */
export const WithMenuSlot: Story = {
  args: {
    tagName: '勉強',
    iconSlot: <TagIcon icon="book-open" color="green" size="sm" />,
    durationMinutes: 45,
    menuSlot: (
      <button
        type="button"
        className="text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-lg text-xs"
        aria-label="Custom menu"
      >
        ⋯
      </button>
    ),
  },
};

/** コロンタグ（separator 表示）。prefix が薄字 + › + suffix。 */
export const ColonTag: Story = {
  args: {
    tagName: '開発:API',
    iconSlot: <TagIcon icon="code" color="blue" size="sm" />,
    durationMinutes: 60,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    tagName: '',
    iconSlot: <TagIcon icon={null} color={null} size="sm" />,
    durationMinutes: 0,
  },
  render: () => (
    <div className="w-64 space-y-1">
      <BlockItem
        tagName="仕事"
        iconSlot={<TagIcon icon="briefcase" color="blue" size="sm" />}
        durationMinutes={60}
        onClick={fn()}
      />
      <BlockItem
        tagName="勉強"
        iconSlot={<TagIcon icon="book-open" color="green" size="sm" />}
        durationMinutes={30}
        onClick={fn()}
      />
      <BlockItem
        tagName="運動"
        iconSlot={<TagIcon icon="dumbbell" color="amber" size="sm" />}
        durationMinutes={45}
        onClick={fn()}
      />
      <BlockItem
        tagName="開発:API"
        iconSlot={<TagIcon icon="code" color="indigo" size="sm" />}
        durationMinutes={60}
        onClick={fn()}
      />
      <BlockItem
        tagName="仕事:定例MTG"
        iconSlot={<TagIcon icon="users" color="blue" size="sm" />}
        durationMinutes={30}
        onClick={fn()}
      />
      <BlockItem
        tagName="プロジェクト管理・定例ミーティング準備"
        iconSlot={<TagIcon icon="calendar" color="indigo" size="sm" />}
        durationMinutes={90}
        onClick={fn()}
      />
      <BlockItem
        tagName="休憩"
        iconSlot={<TagIcon icon="coffee" color="orange" size="sm" />}
        durationMinutes={15}
        onClick={fn()}
      />
      <BlockItem
        tagName="未分類"
        iconSlot={<TagIcon icon={null} color={null} size="sm" />}
        durationMinutes={30}
        onClick={fn()}
      />
    </div>
  ),
};
