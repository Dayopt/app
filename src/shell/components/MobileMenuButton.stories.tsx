import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { useLayoutStore } from '@/stores/useLayoutStore';

import { MobileMenuButton } from '@/shell/components/MobileMenuButton';

/** モバイル用ハンバーガーメニューボタン。クリックでSidebarを開閉する。 */
const meta = {
  title: 'Components/Shell/MobileMenuButton',
  component: MobileMenuButton,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      useLayoutStore.setState({ sidebarOpen: false });
      return <Story />;
    },
  ],
} satisfies Meta<typeof MobileMenuButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示。 */
export const Default: Story = {};

/** className でカスタムスタイルを付与した場合。 */
export const WithClassName: Story = {
  args: {
    className: 'md:hidden',
  },
};

/** サイドバー開放状態（ストアを上書き）。 */
export const SidebarOpen: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ sidebarOpen: true });
      return <Story />;
    },
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-start gap-2">
        <span className="text-muted-foreground text-xs">デフォルト</span>
        <MobileMenuButton />
      </div>
      <div className="flex flex-col items-start gap-2">
        <span className="text-muted-foreground text-xs">md:hidden クラス付き</span>
        <MobileMenuButton className="md:hidden" />
      </div>
    </div>
  ),
};
