/**
 * ActivityPopover Stories
 *
 * Popover の中身（タブ + 通知リスト）を直接レンダリングして各状態を確認する。
 * tRPC をモックし、タブ切り替え・未読/既読の見た目を Storybook 上で検証可能。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { Settings } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import type { ActivityTab } from '../lib/notification-helpers';
import type { NotificationType } from '../schemas';
import { ActivityContent } from './ActivityContent';

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
    type: 'reminder',
    entry_id: 'entry-3',
    is_read: true,
    created_at: oneDayAgo,
    entries: { title: '朝のストレッチ' },
  },
  {
    id: 'notif-4',
    type: 'ai_insight',
    entry_id: null,
    is_read: false,
    created_at: oneHourAgo,
    entries: { title: '午前中の集中力が高い傾向があります' },
  },
  {
    id: 'notif-5',
    type: 'weekly_report',
    entry_id: null,
    is_read: true,
    created_at: oneDayAgo,
    entries: { title: '先週の週次レポート' },
  },
  {
    id: 'notif-6',
    type: 'burnout_warning',
    entry_id: null,
    is_read: false,
    created_at: now,
    entries: { title: '過負荷の兆候が検出されました' },
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

function MockProvider({
  children,
  responseMap,
}: {
  children: ReactNode;
  responseMap: Record<string, unknown>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const link = createMockLink(responseMap);
  const trpcClient = api.createClient({ links: [link] });
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Popover 中身を再現するプレビューコンポーネント
// ─────────────────────────────────────────────────────────

const TABS: ActivityTab[] = ['all', 'reminders', 'ai'];

function ActivityPanelPreview({ defaultTab = 'all' }: { defaultTab?: ActivityTab }) {
  const [activeTab, setActiveTab] = useState<ActivityTab>(defaultTab);

  return (
    <div className="bg-card text-card-foreground w-80 rounded-lg shadow-md">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActivityTab)}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {tab === 'all' ? 'すべて' : tab === 'reminders' ? 'リマインダー' : 'AI'}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button variant="ghost" icon size="sm" aria-label="設定">
            <Settings className="size-4" />
          </Button>
        </div>

        {TABS.map((tab) => (
          <TabsContent key={tab} value={tab} className="px-4 pb-4">
            <ActivityContent tab={tab} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Notifications/ActivityPopover',
  component: ActivityPanelPreview,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ActivityPanelPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.is_read).length;
const defaultResponseMap = {
  'notifications.list': MOCK_NOTIFICATIONS,
  'notifications.unreadCount': unreadCount,
};

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** すべてタブ — 未読・既読が混在 */
export const AllTab: Story = {
  args: { defaultTab: 'all' },
  decorators: [
    (Story) => (
      <MockProvider responseMap={defaultResponseMap}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** リマインダータブ — reminder + overdue のみ表示 */
export const RemindersTab: Story = {
  args: { defaultTab: 'reminders' },
  decorators: [
    (Story) => (
      <MockProvider responseMap={defaultResponseMap}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** AI タブ — ai_insight, weekly_report, burnout_warning のみ表示 */
export const AiTab: Story = {
  args: { defaultTab: 'ai' },
  decorators: [
    (Story) => (
      <MockProvider responseMap={defaultResponseMap}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 通知なし（空状態） */
export const Empty: Story = {
  decorators: [
    (Story) => (
      <MockProvider responseMap={{ 'notifications.list': [], 'notifications.unreadCount': 0 }}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 全既読 */
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
