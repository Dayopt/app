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

/**
 * 「この並びを型として保存」の入口（v1.0 §5.4）。生きた日からのみ作成できる。
 * トリガー後はポップアップではなく、ヘッダーが名前入力＋保存/キャンセルへ
 * 入れ替わり、メインはそのまま保存対象の日の盤面を表示し続ける。
 */
const meta = {
  title: 'Product/Features/Calendar/Templates/SaveAsTemplateEntry',
  component: SaveAsTemplateEntry,
  tags: ['autodocs'],
  args: {
    dayBlocks,
    onSave: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof SaveAsTemplateEntry>;

export default meta;
type Story = StoryObj<typeof meta>;

function MainAreaFrame({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '600px' }}>{children}</div>;
}

/** 未展開の入口ボタン。 */
export const Collapsed: Story = {
  parameters: { layout: 'padded' },
};

/** 展開後: ヘッダーが名前入力＋保存/キャンセルへ入れ替わり、メインは保存対象の日のまま。 */
export const Expanded: Story = {
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <MainAreaFrame>
      <SaveAsTemplateEntry {...args} />
    </MainAreaFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', { name: /保存/ });
    await userEvent.click(trigger);
    await expect(canvas.getByRole('textbox')).toBeInTheDocument();
  },
};

export const AllPatterns: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">未展開</p>
        <SaveAsTemplateEntry dayBlocks={dayBlocks} onSave={fn()} onCancel={fn()} />
      </div>
    </div>
  ),
};
