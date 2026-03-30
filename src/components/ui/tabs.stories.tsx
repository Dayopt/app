import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

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

/** 下線タブ（2タブ） */
export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-96">
      <TabsList className="h-auto rounded-none border-b border-transparent bg-transparent p-0">
        <TabsTrigger value="account">アカウント</TabsTrigger>
        <TabsTrigger value="password">パスワード</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="pt-4">
        <p>アカウント設定がここに表示されます。</p>
      </TabsContent>
      <TabsContent value="password" className="pt-4">
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

/** 下線タブ（3タブ） */
export const ThreeTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList className="h-auto rounded-none border-b border-transparent bg-transparent p-0">
        <TabsTrigger value="overview">概要</TabsTrigger>
        <TabsTrigger value="activity">アクティビティ</TabsTrigger>
        <TabsTrigger value="settings">設定</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        <p>概要コンテンツ</p>
      </TabsContent>
      <TabsContent value="activity" className="pt-4">
        <p>アクティビティコンテンツ</p>
      </TabsContent>
      <TabsContent value="settings" className="pt-4">
        <p>設定コンテンツ</p>
      </TabsContent>
    </Tabs>
  ),
};
