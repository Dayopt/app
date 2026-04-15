/**
 * NotificationSettings Stories
 *
 * 通知設定画面（メール言語設定）を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';

import { NotificationSettings } from './notification-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_USER_SETTINGS = {
  preferredLocale: 'en',
};

const MOCK_USER_SETTINGS_JA = {
  preferredLocale: 'ja',
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/NotificationSettings',
  component: NotificationSettings,
  parameters: {
    layout: 'padded',
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS },
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

/** デフォルト状態（英語） */
export const Default: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
};

/** 日本語設定 */
export const Japanese: Story = {
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS_JA },
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
        <h3 className="text-foreground mb-4 text-lg font-medium">Default (English)</h3>
        <StoryTRPCProvider mocks={{ 'userSettings.get': MOCK_USER_SETTINGS }}>
          <NotificationSettings />
        </StoryTRPCProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-medium">Japanese</h3>
        <StoryTRPCProvider mocks={{ 'userSettings.get': MOCK_USER_SETTINGS_JA }}>
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
