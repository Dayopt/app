/**
 * UpdateBanner Stories
 *
 * Service Worker 更新通知バナー。
 * 新しいバージョンが利用可能になった時に、適用または後回しを促す。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { UpdateBanner } from './UpdateBanner';

const meta = {
  title: 'Product/Components/Shell/UpdateBanner',
  component: UpdateBanner,
  parameters: { layout: 'fullscreen' },
  args: {
    onUpdate: fn(),
    onDismiss: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UpdateBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示。更新ボタンと後でボタンを含む。 */
export const Default: Story = {};

/** モバイル幅での表示確認。 */
export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: (args) => (
    <div className="relative h-[300px]">
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        ページコンテンツ
      </div>
      <UpdateBanner {...args} />
    </div>
  ),
};
