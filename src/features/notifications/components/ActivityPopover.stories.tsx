/**
 * ActivityPopover Stories
 *
 * Popover の中身（タブ + 通知リスト）を直接レンダリングして各状態を確認する。
 * tRPC をモックし、タブ切り替え・未読/既読の見た目を Storybook 上で検証可能。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Settings } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/lib/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/lib/components/ui/tabs';

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
    type: 'reminder',
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
// Popover 中身を再現するプレビューコンポーネント
// ─────────────────────────────────────────────────────────

const TABS: ActivityTab[] = ['all', 'reminders', 'ai'];

function ActivityPanelPreview({ defaultTab = 'all' }: { defaultTab?: ActivityTab }) {
  const [activeTab, setActiveTab] = useState<ActivityTab>(defaultTab);

  return (
    <div className="bg-card text-card-foreground shadow-card w-80 rounded-lg">
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

const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.is_read).length;

const meta = {
  title: 'Features/Notifications/ActivityPopover',
  component: ActivityPanelPreview,
  parameters: {
    layout: 'padded',
    trpcMocks: {
      'notifications.list': MOCK_NOTIFICATIONS,
      'notifications.unreadCount': unreadCount,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ActivityPanelPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** すべてタブ — 未読・既読が混在 */
export const AllTab: Story = {
  args: { defaultTab: 'all' },
};

/** リマインダータブ — reminder のみ表示 */
export const RemindersTab: Story = {
  args: { defaultTab: 'reminders' },
};

/** AI タブ — ai_insight, weekly_report, burnout_warning のみ表示 */
export const AiTab: Story = {
  args: { defaultTab: 'ai' },
};

/** 通知なし（空状態） */
export const Empty: Story = {
  parameters: {
    trpcMocks: {
      'notifications.list': [],
      'notifications.unreadCount': 0,
    },
  },
};

/** 全既読 */
export const AllRead: Story = {
  parameters: {
    trpcMocks: {
      'notifications.list': MOCK_NOTIFICATIONS.map((n) => ({ ...n, is_read: true })),
      'notifications.unreadCount': 0,
    },
  },
};
