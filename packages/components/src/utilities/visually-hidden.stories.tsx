import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Bell, Search, Settings } from 'lucide-react';

import { Button, VisuallyHidden } from '@dayopt/components';

const meta = {
  title: 'Shared/Components/Utilities/VisuallyHidden',
  component: VisuallyHidden,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'スクリーンリーダーだけに伝える文言',
    },
  },
} satisfies Meta<typeof VisuallyHidden>;

export default meta;
type Story = StoryObj<typeof meta>;

/** アイコンボタンへ視覚非表示のラベルを付与する例。 */
export const Default: Story = {
  args: {
    children: '検索',
  },
  render: (args) => (
    <Button variant="ghost" icon>
      <Search className="size-4" />
      <VisuallyHidden {...args} />
    </Button>
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="ghost" icon>
        <Search className="size-4" />
        <VisuallyHidden>検索</VisuallyHidden>
      </Button>
      <Button variant="ghost" icon>
        <Bell className="size-4" />
        <VisuallyHidden>通知</VisuallyHidden>
      </Button>
      <Button variant="ghost" icon>
        <Settings className="size-4" />
        <VisuallyHidden>設定</VisuallyHidden>
      </Button>
    </div>
  ),
};
