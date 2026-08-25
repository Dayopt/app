import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SaveAsTemplateEntry } from './SaveAsTemplateEntry';
import type { TemplateBlockMock } from './types';

const dayBlocks: TemplateBlockMock[] = [
  {
    id: 'b1',
    activityName: '集中作業',
    categoryColor: 'blue',
    categoryIcon: 'briefcase',
    anchorRatio: 0.1,
    medianDurationRatio: 0.3,
  },
  {
    id: 'b2',
    activityName: 'MTG',
    categoryColor: 'indigo',
    categoryIcon: 'users',
    anchorRatio: 0.45,
    medianDurationRatio: 0.1,
  },
];

/** 「この並びを型として保存」の入口（v1.0 §5.4）。生きた日からのみ作成できる。 */
const meta = {
  title: 'Product/Features/Calendar/Templates/SaveAsTemplateEntry',
  component: SaveAsTemplateEntry,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    dayBlocks,
    onSave: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof SaveAsTemplateEntry>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 未展開の入口ボタン。 */
export const Collapsed: Story = {};

/** 展開後: 保存対象のプレビュー + 名前入力（クリックして開いた状態を再現）。 */
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button');
    await userEvent.click(trigger);
    await expect(canvas.getByRole('textbox')).toBeInTheDocument();
  },
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">未展開</p>
        <SaveAsTemplateEntry dayBlocks={dayBlocks} onSave={fn()} onCancel={fn()} />
      </div>
    </div>
  ),
};
