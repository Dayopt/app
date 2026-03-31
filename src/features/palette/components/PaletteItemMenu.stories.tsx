/**
 * PaletteItemMenu Stories
 *
 * パレットアイテムの DropdownMenu（duration 変更 + 削除）。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { TagIcon } from '@/features/tags';
import { BlockItem } from '@/shell/components/sidebar';

import { PaletteItemMenu } from './PaletteItemMenu';

const meta = {
  title: 'Features/Palette/ItemMenu',
  component: PaletteItemMenu,
  parameters: { layout: 'padded' },
  args: {
    itemId: 'pin-1',
    currentDuration: 60,
    onChangeDuration: fn(),
    onRemove: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PaletteItemMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** BlockItem 内での表示（ホバーで ⋯ アイコン表示）。 */
export const InBlockItem: Story = {
  render: (args) => (
    <div className="w-64">
      <BlockItem
        tagName="仕事"
        iconSlot={<TagIcon icon="briefcase" color="blue" size="sm" />}
        durationMinutes={args.currentDuration}
        onClick={fn()}
        menuSlot={<PaletteItemMenu {...args} />}
      />
    </div>
  ),
};

/** 30分が選択された状態。 */
export const Duration30m: Story = {
  args: { currentDuration: 30 },
  render: (args) => (
    <div className="w-64">
      <BlockItem
        tagName="勉強"
        iconSlot={<TagIcon icon="book-open" color="green" size="sm" />}
        durationMinutes={args.currentDuration}
        onClick={fn()}
        menuSlot={<PaletteItemMenu {...args} />}
      />
    </div>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-2 text-xs">60m selected</p>
        <div className="w-64">
          <BlockItem
            tagName="仕事"
            iconSlot={<TagIcon icon="briefcase" color="blue" size="sm" />}
            durationMinutes={60}
            onClick={fn()}
            menuSlot={
              <PaletteItemMenu
                itemId="pin-1"
                currentDuration={60}
                onChangeDuration={fn()}
                onRemove={fn()}
              />
            }
          />
        </div>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs">15m selected</p>
        <div className="w-64">
          <BlockItem
            tagName="休憩"
            iconSlot={<TagIcon icon="coffee" color="orange" size="sm" />}
            durationMinutes={15}
            onClick={fn()}
            menuSlot={
              <PaletteItemMenu
                itemId="pin-2"
                currentDuration={15}
                onChangeDuration={fn()}
                onRemove={fn()}
              />
            }
          />
        </div>
      </div>
    </div>
  ),
};
