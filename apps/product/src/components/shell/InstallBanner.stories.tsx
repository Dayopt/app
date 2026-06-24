/**
 * InstallBanner Stories
 *
 * PWA インストール促進バナー。
 * モバイルブラウザでのアクセス時に「ホーム画面に追加」を促す。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { InstallBanner } from './InstallBanner';

const meta = {
  title: 'Product/Components/Shell/InstallBanner',
  component: InstallBanner,
  parameters: { layout: 'fullscreen' },
  args: {
    onInstall: fn(),
    onDismiss: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof InstallBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示。インストールボタンと閉じるボタンを含む。 */
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
      <InstallBanner {...args} />
    </div>
  ),
};
