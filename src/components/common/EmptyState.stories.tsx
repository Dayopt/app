import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CalendarDays, Inbox } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Components/Common/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    title: {
      control: 'text',
      description: 'タイトル',
    },
    description: {
      control: 'text',
      description: '説明文',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'サイズ',
    },
    centered: {
      control: 'boolean',
      description: '親要素内で中央配置',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 標準（size="md"）。icon + title + description。実使用: AgendaView */
export const Default: Story = {
  args: {
    icon: CalendarDays,
    title: '予定がありません',
    description: '今日の予定はまだ登録されていません。',
  },
};

/** テーブル内（size="sm" + centered + actions）。実使用: TableEmptyState, PlanTableEmptyState */
export const TableEmpty: Story = {
  decorators: [
    (Story) => (
      <div className="border-border h-[300px] w-[400px] rounded-2xl border">
        <Story />
      </div>
    ),
  ],
  args: {
    icon: Inbox,
    title: 'アイテムがありません',
    description: '新しいアイテムを作成して始めましょう。',
    size: 'sm',
    centered: true,
    actions: <Button size="sm">新規作成</Button>,
  },
};

/** 大サイズ（size="lg"）。フルページの空状態に使用。 */
export const LargeSize: Story = {
  args: {
    icon: CalendarDays,
    title: '予定がありません',
    description: '今日の予定はまだ登録されていません。新しい予定を追加して始めましょう。',
    size: 'lg',
  },
};

/** actionLabel / onAction パターン。内蔵ボタンで手軽にアクションを追加。 */
export const WithActionLabel: Story = {
  args: {
    icon: Inbox,
    title: 'タスクがありません',
    description: '新しいタスクを作成して生産性を高めましょう。',
    actionLabel: '新規作成',
    onAction: () => undefined,
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    title: '',
  },
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <p className="text-muted-foreground text-xs">size=&quot;md&quot;（標準）</p>
      <EmptyState
        icon={CalendarDays}
        title="予定がありません"
        description="今日の予定はまだ登録されていません。"
      />

      <p className="text-muted-foreground text-xs">size=&quot;sm&quot; + centered（テーブル内）</p>
      <div className="border-border h-[300px] w-[400px] rounded-2xl border">
        <EmptyState
          icon={Inbox}
          title="アイテムがありません"
          description="新しいアイテムを作成して始めましょう。"
          size="sm"
          centered
          actions={<Button size="sm">新規作成</Button>}
        />
      </div>

      <p className="text-muted-foreground text-xs">size=&quot;lg&quot;（フルページ）</p>
      <EmptyState
        icon={CalendarDays}
        title="予定がありません"
        description="今日の予定はまだ登録されていません。新しい予定を追加して始めましょう。"
        size="lg"
      />

      <p className="text-muted-foreground text-xs">actionLabel / onAction（内蔵ボタン）</p>
      <EmptyState
        icon={Inbox}
        title="タスクがありません"
        description="新しいタスクを作成して生産性を高めましょう。"
        actionLabel="新規作成"
        onAction={() => undefined}
      />
    </div>
  ),
};
