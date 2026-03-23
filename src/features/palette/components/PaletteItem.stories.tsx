/**
 * PaletteItem Stories
 *
 * PaletteItem は BlockItem の re-export。
 * パレット固有の利用パターンを確認するための Story。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { PaletteItem } from './PaletteItem';

const meta = {
  title: 'Features/Palette/PaletteItem',
  component: PaletteItem,
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
} satisfies Meta<typeof PaletteItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ピン留めアイテム（パレット標準）。 */
export const Default: Story = {
  args: {
    tagName: '仕事',
    tagColor: 'blue',
    durationMinutes: 60,
  },
};

/** 長いタグ名（truncate 確認）。 */
export const LongName: Story = {
  args: {
    tagName: 'プロジェクト管理・定例ミーティング準備',
    tagColor: 'indigo',
    durationMinutes: 90,
  },
};

/** 短い duration。 */
export const ShortDuration: Story = {
  args: {
    tagName: '休憩',
    tagColor: 'amber',
    durationMinutes: 15,
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
      <PaletteItem tagName="仕事" tagColor="blue" durationMinutes={60} onClick={fn()} />
      <PaletteItem tagName="勉強" tagColor="green" durationMinutes={30} onClick={fn()} />
      <PaletteItem tagName="運動" tagColor="amber" durationMinutes={45} onClick={fn()} />
      <PaletteItem
        tagName="プロジェクト管理・定例ミーティング準備"
        tagColor="indigo"
        durationMinutes={90}
        onClick={fn()}
      />
      <PaletteItem tagName="休憩" tagColor="orange" durationMinutes={15} onClick={fn()} />
    </div>
  ),
};
