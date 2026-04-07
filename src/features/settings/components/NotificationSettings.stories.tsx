/**
 * NotificationSettings Stories
 *
 * tRPC の notificationPreferences をモックして通知設定画面を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';

import { NotificationSettings } from './notification-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_NOTIFICATION_PREFERENCES = {
  enableBrowserNotifications: true,
  enableEmailNotifications: false,
  enablePushNotifications: false,
  defaultReminderEnabled: true,
};

const MOCK_ALL_DISABLED = {
  enableBrowserNotifications: false,
  enableEmailNotifications: false,
  enablePushNotifications: false,
  defaultReminderEnabled: false,
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/NotificationSettings',
  component: NotificationSettings,
  parameters: {
    layout: 'padded',
    trpcMocks: { 'notificationPreferences.get': MOCK_NOTIFICATION_PREFERENCES },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotificationSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（ブラウザ通知ON・メール/プッシュOFF） */
export const Default: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
};

/** 全通知無効状態 */
export const AllDisabled: Story = {
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'notificationPreferences.get': MOCK_ALL_DISABLED },
  },
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  parameters: { trpcPending: true },
};

/** 全ストーリーを並べて一覧表示 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-foreground mb-4 text-lg font-medium">Default</h3>
        <StoryTRPCProvider mocks={{ 'notificationPreferences.get': MOCK_NOTIFICATION_PREFERENCES }}>
          <NotificationSettings />
        </StoryTRPCProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-medium">All Disabled</h3>
        <StoryTRPCProvider mocks={{ 'notificationPreferences.get': MOCK_ALL_DISABLED }}>
          <NotificationSettings />
        </StoryTRPCProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-medium">Loading</h3>
        <StoryTRPCProvider pending>
          <NotificationSettings />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
