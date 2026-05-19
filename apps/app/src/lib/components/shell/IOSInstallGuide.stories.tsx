/**
 * IOSInstallGuide Stories
 *
 * iOS Safari 向け PWA インストール手順ガイド。
 * 「共有 → ホーム画面に追加」のステップバイステップ手順を案内する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { IOSInstallGuide } from './IOSInstallGuide';

const meta = {
  title: 'Components/Shell/IOSInstallGuide',
  component: IOSInstallGuide,
  parameters: { layout: 'fullscreen' },
  args: {
    onDismiss: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof IOSInstallGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示。共有アイコン + 2ステップの手順を表示。 */
export const Default: Story = {};

/** モバイル幅での表示確認（iOS Safari の想定環境）。 */
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
      <IOSInstallGuide {...args} />
    </div>
  ),
};
