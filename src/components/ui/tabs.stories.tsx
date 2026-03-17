import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BarChart3, Calendar, CircleCheckBig, Clock, Settings, User } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';

import { Tabs, TabsContent, TabsList, TabsTrigger, UnderlineTabsTrigger } from './tabs';

const meta = {
  title: 'Components/UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-96">
      <TabsList>
        <TabsTrigger value="account">アカウント</TabsTrigger>
        <TabsTrigger value="password">パスワード</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="p-4">
        <p>アカウント設定がここに表示されます。</p>
      </TabsContent>
      <TabsContent value="password" className="p-4">
        <p>パスワード設定がここに表示されます。</p>
      </TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 初期状態でアカウントタブのコンテンツが表示されている
    await expect(canvas.getByText('アカウント設定がここに表示されます。')).toBeInTheDocument();

    // パスワードタブをクリック
    const passwordTab = canvas.getByRole('tab', { name: /パスワード/i });
    await userEvent.click(passwordTab);

    // パスワードタブのコンテンツが表示される
    await expect(canvas.getByText('パスワード設定がここに表示されます。')).toBeInTheDocument();

    // アカウントタブに戻る
    const accountTab = canvas.getByRole('tab', { name: /アカウント/i });
    await userEvent.click(accountTab);
    await expect(canvas.getByText('アカウント設定がここに表示されます。')).toBeInTheDocument();
  },
};

export const ThreeTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList>
        <TabsTrigger value="overview">概要</TabsTrigger>
        <TabsTrigger value="analytics">分析</TabsTrigger>
        <TabsTrigger value="reports">レポート</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="p-4">
        <p>概要コンテンツ</p>
      </TabsContent>
      <TabsContent value="analytics" className="p-4">
        <p>分析コンテンツ</p>
      </TabsContent>
      <TabsContent value="reports" className="p-4">
        <p>レポートコンテンツ</p>
      </TabsContent>
    </Tabs>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <Tabs defaultValue="tab1" className="w-full max-w-md">
        <TabsList>
          <TabsTrigger value="tab1">アカウント</TabsTrigger>
          <TabsTrigger value="tab2">通知</TabsTrigger>
          <TabsTrigger value="tab3">表示</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="border-border mt-2 rounded-lg border p-4">
          アカウント設定
        </TabsContent>
        <TabsContent value="tab2" className="border-border mt-2 rounded-lg border p-4">
          通知設定
        </TabsContent>
        <TabsContent value="tab3" className="border-border mt-2 rounded-lg border p-4">
          表示設定
        </TabsContent>
      </Tabs>

      <Tabs defaultValue="calendar" className="w-full max-w-xs">
        <TabsList>
          <TabsTrigger value="calendar" className="px-3" aria-label="カレンダー" title="カレンダー">
            <Calendar className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="plan" className="px-3" aria-label="プラン" title="プラン">
            <CircleCheckBig className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="record" className="px-3" aria-label="記録" title="記録">
            <Clock className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="stats" className="px-3" aria-label="統計" title="統計">
            <BarChart3 className="size-4" />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" />
        <TabsContent value="plan" />
        <TabsContent value="record" />
        <TabsContent value="stats" />
      </Tabs>

      <Tabs defaultValue="profile" className="w-full max-w-md">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="size-4" />
            プロフィール
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="size-4" />
            設定
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" />
        <TabsContent value="settings" />
      </Tabs>

      <Tabs defaultValue="overview" className="w-full max-w-md">
        <TabsList className="h-auto gap-4 rounded-none border-b border-transparent bg-transparent p-0">
          <UnderlineTabsTrigger value="overview">概要</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="activity">アクティビティ</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="settings">設定</UnderlineTabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          概要コンテンツ
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          アクティビティコンテンツ
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          設定コンテンツ
        </TabsContent>
      </Tabs>
    </div>
  ),
};
