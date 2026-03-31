import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Separator } from './separator';

const meta = {
  title: 'Components/UI/Separator',
  component: Separator,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 水平区切り線（デフォルト）。 */
export const Default: Story = {
  args: {},
};

/** 垂直区切り線。 */
export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
  decorators: [
    (Story) => (
      <div className="flex h-8 items-center">
        <Story />
      </div>
    ),
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="w-full max-w-md">
        <p className="text-muted-foreground mb-2 text-xs font-medium">Horizontal（デフォルト）</p>
        <div className="space-y-4">
          <p className="text-foreground text-sm">上のコンテンツ</p>
          <Separator />
          <p className="text-foreground text-sm">下のコンテンツ</p>
        </div>
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium">Vertical</p>
        <div className="flex h-8 items-center gap-4">
          <span className="text-foreground text-sm">左</span>
          <Separator orientation="vertical" />
          <span className="text-foreground text-sm">右</span>
        </div>
      </div>
    </div>
  ),
};
