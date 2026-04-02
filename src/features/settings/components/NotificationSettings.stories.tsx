/**
 * NotificationSettings Stories
 *
 * tRPC の notificationPreferences をモックして通知設定画面を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

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
// tRPC Mock Helpers
// ─────────────────────────────────────────────────────────

function createMockLink(responseMap: Record<string, unknown>): TRPCLink<AppRouter> {
  return () => {
    return ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        if (op.type === 'mutation') {
          observer.next({ result: { type: 'data', data: {} } });
        }
        observer.complete();
      });
  };
}

function createPendingLink(): TRPCLink<AppRouter> {
  return () => {
    return () =>
      observable(() => {
        // observer.next / observer.complete を呼ばないことでローディングを維持
      });
  };
}

function MockProvider({
  children,
  responseMap,
  pending,
}: {
  children: ReactNode;
  responseMap?: Record<string, unknown>;
  pending?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const link = pending ? createPendingLink() : createMockLink(responseMap ?? {});
  const trpcClient = api.createClient({ links: [link] });
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/NotificationSettings',
  component: NotificationSettings,
  parameters: {
    layout: 'padded',
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
  decorators: [
    (Story) => (
      <MockProvider responseMap={{ 'notificationPreferences.get': MOCK_NOTIFICATION_PREFERENCES }}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 全通知無効状態 */
export const AllDisabled: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <MockProvider responseMap={{ 'notificationPreferences.get': MOCK_ALL_DISABLED }}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <MockProvider pending>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 全ストーリーを並べて一覧表示 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-foreground mb-4 text-lg font-bold">Default</h3>
        <MockProvider
          responseMap={{ 'notificationPreferences.get': MOCK_NOTIFICATION_PREFERENCES }}
        >
          <NotificationSettings />
        </MockProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-bold">All Disabled</h3>
        <MockProvider responseMap={{ 'notificationPreferences.get': MOCK_ALL_DISABLED }}>
          <NotificationSettings />
        </MockProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-bold">Loading</h3>
        <MockProvider pending>
          <NotificationSettings />
        </MockProvider>
      </div>
    </div>
  ),
};
