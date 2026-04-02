import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { NotificationItem } from './NotificationItem';

const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const meta = {
  title: 'Features/Notifications/Item',
  component: NotificationItem,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '通知アイテムコンポーネント。リマインダー・期限超過など各種通知タイプに対応。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    id: '1',
    locale: 'ja',
    isRead: false,
    createdAt: fiveMinutesAgo,
    onMarkAsRead: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <div className="bg-surface w-96 rounded-2xl border p-1">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotificationItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reminder: Story = {
  args: {
    type: 'reminder',
    entryTitle: 'ミーティングの準備',
  },
};

export const Overdue: Story = {
  args: {
    type: 'overdue',
    entryTitle: 'レポート提出',
  },
};

export const Read: Story = {
  args: {
    type: 'reminder',
    entryTitle: 'ミーティングの準備',
    isRead: true,
    createdAt: oneHourAgo,
  },
};

export const Deleting: Story = {
  args: {
    type: 'reminder',
    entryTitle: 'タスク完了',
    isRead: true,
    isDeleting: true,
  },
};

/** AI インサイト通知 */
export const AiInsight: Story = {
  args: {
    type: 'ai_insight',
    entryTitle: 'AI が新しいインサイトを生成しました',
  },
};

/** 週次レポート通知 */
export const WeeklyReport: Story = {
  args: {
    type: 'weekly_report',
    entryTitle: '先週の週次レポートが届きました',
    createdAt: yesterday,
    isRead: false,
  },
};

/** バーンアウト警告通知 */
export const BurnoutWarning: Story = {
  args: {
    type: 'burnout_warning',
    entryTitle: '過負荷の兆候が検出されました',
    createdAt: oneHourAgo,
  },
};

/** エネルギーインサイト通知 */
export const EnergyInsight: Story = {
  args: {
    type: 'energy_insight',
    entryTitle: 'あなたのエネルギーパターンに変化があります',
  },
};

/** 全通知タイプ一覧 */
export const AllTypes: Story = {
  args: {
    type: 'reminder',
    entryTitle: '',
  },
  render: (args) => (
    <div className="space-y-1">
      <NotificationItem {...args} id="1" type="reminder" entryTitle="リマインダー" />
      <NotificationItem
        {...args}
        id="2"
        type="overdue"
        entryTitle="期限超過タスク"
        createdAt={yesterday}
      />
      <NotificationItem
        {...args}
        id="3"
        type="ai_insight"
        entryTitle="AI が新しいインサイトを生成しました"
      />
      <NotificationItem
        {...args}
        id="4"
        type="weekly_report"
        entryTitle="先週の週次レポートが届きました"
        createdAt={yesterday}
      />
      <NotificationItem
        {...args}
        id="5"
        type="burnout_warning"
        entryTitle="過負荷の兆候が検出されました"
        createdAt={oneHourAgo}
      />
      <NotificationItem
        {...args}
        id="6"
        type="energy_insight"
        entryTitle="あなたのエネルギーパターンに変化があります"
      />
      <NotificationItem
        {...args}
        id="7"
        type="reminder"
        entryTitle="既読のリマインダー"
        isRead={true}
        createdAt={yesterday}
      />
    </div>
  ),
};
