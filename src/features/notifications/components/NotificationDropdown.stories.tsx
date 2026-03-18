/**
 * NotificationDropdown Stories
 *
 * tRPC の notifications クエリをモックして通知ドロップダウンの各状態を再現する。
 * GeneralSettings.stories.tsx と同じ MockProvider パターンを使用。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import type { NotificationType } from '../schemas';
import { NotificationDropdown } from './NotificationDropdown';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const now = new Date().toISOString();
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

interface MockNotification {
  id: string;
  type: NotificationType;
  entry_id: string | null;
  is_read: boolean;
  created_at: string;
  entries?: { title: string } | null;
}

const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: 'notif-1',
    type: 'reminder',
    entry_id: 'entry-1',
    is_read: false,
    created_at: now,
    entries: { title: 'デザインレビュー' },
  },
  {
    id: 'notif-2',
    type: 'overdue',
    entry_id: 'entry-2',
    is_read: false,
    created_at: oneHourAgo,
    entries: { title: '週次報告書の作成' },
  },
  {
    id: 'notif-3',
    type: 'ai_insight',
    entry_id: null,
    is_read: true,
    created_at: oneDayAgo,
    entries: null,
  },
  {
    id: 'notif-4',
    type: 'weekly_report',
    entry_id: null,
    is_read: true,
    created_at: oneDayAgo,
    entries: null,
  },
];

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
        // observer.next / complete を呼ばないことでローディングを維持
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

const mockResponseMap = {
  'notifications.list': MOCK_NOTIFICATIONS,
  'notifications.unreadCount': 2,
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** 通知ドロップダウン。ベルアイコン・未読バッジ・日付グループ化リストを含む。 */
const meta = {
  title: 'Features/Notifications/NotificationDropdown',
  component: NotificationDropdown,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NotificationDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** 通知あり・未読2件。 */
export const Default: Story = {
  decorators: [
    (Story) => (
      <MockProvider responseMap={mockResponseMap}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 通知なし（空状態）。 */
export const Empty: Story = {
  decorators: [
    (Story) => (
      <MockProvider responseMap={{ 'notifications.list': [], 'notifications.unreadCount': 0 }}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** ローディング状態。 */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <MockProvider pending>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 未読なし（全既読）。 */
export const AllRead: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        responseMap={{
          'notifications.list': MOCK_NOTIFICATIONS.map((n) => ({ ...n, is_read: true })),
          'notifications.unreadCount': 0,
        }}
      >
        <Story />
      </MockProvider>
    ),
  ],
};

/** サイズ small（sm）。 */
export const SmallSize: Story = {
  args: {
    size: 'sm',
  },
  decorators: [
    (Story) => (
      <MockProvider responseMap={mockResponseMap}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">デフォルト（未読2件）</span>
        <MockProvider responseMap={mockResponseMap}>
          <NotificationDropdown />
        </MockProvider>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">サイズ sm</span>
        <MockProvider responseMap={mockResponseMap}>
          <NotificationDropdown size="sm" />
        </MockProvider>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">未読なし</span>
        <MockProvider
          responseMap={{
            'notifications.list': MOCK_NOTIFICATIONS.map((n) => ({ ...n, is_read: true })),
            'notifications.unreadCount': 0,
          }}
        >
          <NotificationDropdown />
        </MockProvider>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">通知なし（空）</span>
        <MockProvider responseMap={{ 'notifications.list': [], 'notifications.unreadCount': 0 }}>
          <NotificationDropdown />
        </MockProvider>
      </div>
    </div>
  ),
};
