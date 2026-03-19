/**
 * SettingsSidebar Stories
 *
 * 設定カテゴリナビゲーションサイドバー。
 * PC（Dialog内）: useSettingsStore でカテゴリ切替。
 * Mobile（実ページ）: usePathname でカテゴリを判定（Link表示）。
 *
 * useSettingsStore.setState でアクティブカテゴリを制御。
 * useMediaQuery のモックで PC/Mobile 両レイアウトを確認。
 */

import { useSettingsStore } from '@/stores/useSettingsStore';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { SETTINGS_CATEGORIES } from '../constants';
import { SettingsSidebar } from './SettingsSidebar';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/**
 * SettingsSidebar — 設定カテゴリナビゲーションサイドバー
 *
 * PC: button で store のカテゴリを切替（URL変更なし）。
 * Mobile: Link でページ遷移（pathname からアクティブカテゴリを判定）。
 * 6カテゴリ（プロフィール・表示・通知・データ・課金・アカウント）を表示。
 */
const meta = {
  title: 'Features/Settings/SettingsSidebar',
  component: SettingsSidebar,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[600px] w-60 overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（プロフィールカテゴリ選択中）
 *
 * PC表示（button要素）。「プロフィール」がアクティブ表示。
 */
export const Default: Story = {
  decorators: [
    (Story) => {
      useSettingsStore.setState({ isOpen: true, category: 'profile' });
      return <Story />;
    },
  ],
};

/**
 * 表示設定カテゴリ選択中
 */
export const DisplayActive: Story = {
  decorators: [
    (Story) => {
      useSettingsStore.setState({ isOpen: true, category: 'display' });
      return <Story />;
    },
  ],
};

/**
 * 通知設定カテゴリ選択中
 */
export const NotificationsActive: Story = {
  decorators: [
    (Story) => {
      useSettingsStore.setState({ isOpen: true, category: 'notifications' });
      return <Story />;
    },
  ],
};

/**
 * データ設定カテゴリ選択中
 */
export const DataActive: Story = {
  decorators: [
    (Story) => {
      useSettingsStore.setState({ isOpen: true, category: 'data' });
      return <Story />;
    },
  ],
};

/**
 * 課金設定カテゴリ選択中
 */
export const BillingActive: Story = {
  decorators: [
    (Story) => {
      useSettingsStore.setState({ isOpen: true, category: 'billing' });
      return <Story />;
    },
  ],
};

/**
 * アカウント設定カテゴリ選択中
 */
export const AccountActive: Story = {
  decorators: [
    (Story) => {
      useSettingsStore.setState({ isOpen: true, category: 'account' });
      return <Story />;
    },
  ],
};

/**
 * 全カテゴリパターン一覧
 *
 * 各カテゴリがアクティブになった状態を横並びで確認できる。
 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="flex flex-wrap gap-4">
      {SETTINGS_CATEGORIES.map((cat) => {
        useSettingsStore.setState({ isOpen: true, category: cat.id });
        return (
          <div key={cat.id} className="h-[500px] w-56 overflow-hidden rounded-lg border">
            <p className="text-muted-foreground border-b px-3 py-1 text-xs">{cat.id}</p>
            <SettingsSidebar />
          </div>
        );
      })}
    </div>
  ),
  decorators: [],
};
