import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { CreateActionSheet } from './CreateActionSheet';

const meta = {
  title: 'Components/Shell/CreateActionSheet',
  component: CreateActionSheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  args: {
    open: true,
    onOpenChange: fn(),
    onSelect: fn(),
  },
} satisfies Meta<typeof CreateActionSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 開いた状態（デフォルト）。Plan / Record の選択肢を表示。 */
export const Default: Story = {};

/** 閉じた状態。 */
export const Closed: Story = {
  args: {
    open: false,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-muted-foreground mb-3 text-xs font-medium">Open</p>
        <CreateActionSheet {...args} open />
      </div>
    </div>
  ),
};
