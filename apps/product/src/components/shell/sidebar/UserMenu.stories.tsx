import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { UserMenu } from './UserMenu';

/** UserMenu - サイドバーフッターのユーザーメニュー */
const meta = {
  title: 'Product/Components/Shell/Sidebar/UserMenu',
  component: UserMenu,
  parameters: {
    layout: 'centered',
  },
  args: {
    user: { name: '田中 太郎', email: 'taro.tanaka@example.com', avatar: null },
  },
  argTypes: {
    user: { control: false },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示。アバター画像なし。 */
export const Default: Story = {
  render: () => (
    <div className="w-64">
      <UserMenu user={{ name: '田中 太郎', email: 'taro.tanaka@example.com', avatar: null }} />
    </div>
  ),
};

/** アバター画像あり。 */
export const WithAvatar: Story = {
  render: () => (
    <div className="w-64">
      <UserMenu
        user={{
          name: 'Jane Smith',
          email: 'jane.smith@example.com',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
        }}
      />
    </div>
  ),
};

/** 長い名前（truncate 確認用）。 */
export const LongName: Story = {
  render: () => (
    <div className="w-64">
      <UserMenu
        user={{
          name: 'Very Long Username That Should Be Truncated',
          email: 'very.long.email.address@example.com',
          avatar: null,
        }}
      />
    </div>
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
    <div className="flex w-64 flex-col gap-6">
      <div>
        <UserMenu user={{ name: '田中 太郎', email: 'taro@example.com', avatar: null }} />
      </div>
      <div>
        <UserMenu
          user={{
            name: 'Jane Smith',
            email: 'jane@example.com',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
          }}
        />
      </div>
      <div>
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
