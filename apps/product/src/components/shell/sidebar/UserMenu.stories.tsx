import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { UserMenu } from './UserMenu';

/** UserMenu - サイドバーフッターのユーザーメニュー */
const meta = {
  title: 'Product/Components/Shell/Sidebar/UserMenu',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示。アバター画像なし。 */
export const Default: Story = {
  render: () => (
    <UserMenu user={{ name: '田中 太郎', email: 'taro.tanaka@example.com', avatar: null }} />
  ),
};

/** アバター画像あり。 */
export const WithAvatar: Story = {
  render: () => (
    <UserMenu
      user={{
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
      }}
    />
  ),
};

/** 長い名前（truncate 確認用）。 */
export const LongName: Story = {
  render: () => (
    <UserMenu
      user={{
        name: 'Very Long Username That Should Be Truncated',
        email: 'very.long.email.address@example.com',
        avatar: null,
      }}
    />
  ),
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: 'image-redundant-alt', enabled: false },
          { id: 'landmark-main-is-top-level', enabled: false },
          { id: 'landmark-no-duplicate-main', enabled: false },
          { id: 'landmark-unique', enabled: false },
        ],
      },
    },
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">アバター画像なし</span>
        <UserMenu user={{ name: '田中 太郎', email: 'taro@example.com', avatar: null }} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">アバター画像あり</span>
        <UserMenu
          user={{
            name: 'Jane Smith',
            email: 'jane@example.com',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">長い名前（truncate）</span>
        <UserMenu
          user={{
            name: 'Very Long Username That Truncates',
            email: 'long@example.com',
            avatar: null,
          }}
        />
      </div>
    </div>
  ),
};
