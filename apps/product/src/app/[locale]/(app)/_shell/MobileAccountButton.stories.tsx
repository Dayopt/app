import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MobileAccountButton } from './MobileAccountButton';

const meta = {
  title: 'Product/Components/Shell/MobileAccountButton',
  component: MobileAccountButton,
  parameters: {
    layout: 'centered',
    viewport: { defaultViewport: 'mobile1' },
  },
  tags: ['autodocs'],
  args: {
    href: '/ja/settings',
    displayName: 'Tomoya Tanaka',
    ariaLabel: 'アカウント',
  },
} satisfies Meta<typeof MobileAccountButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** アバター画像なしの標準状態。 */
export const Default: Story = {};

/** アバター画像がある状態。 */
export const WithAvatar: Story = {
  args: {
    avatarUrl: 'https://github.com/shadcn.png',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <MobileAccountButton href="/ja/settings" displayName="Tomoya Tanaka" ariaLabel="アカウント" />
      <MobileAccountButton
        href="/ja/settings"
        displayName="Tomoya Tanaka"
        avatarUrl="https://github.com/shadcn.png"
        ariaLabel="アカウント"
      />
    </div>
  ),
};
