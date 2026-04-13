import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Badge } from './badge';

const meta = {
  title: 'Components/UI/Badge',
  component: Badge,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'success', 'warning', 'info', 'destructive'],
      description: 'バッジのスタイルバリアント',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Badge',
    variant: 'secondary',
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">+3件</Badge>
        <Badge variant="secondary">5</Badge>
        <Badge variant="secondary">99+</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">進行中</Badge>
        <Badge variant="outline">完了</Badge>
        <Badge variant="outline">保留</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">NEW</Badge>
        <Badge variant="primary">注目</Badge>
        <Badge variant="primary">おすすめ</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">完了</Badge>
        <Badge variant="success">+10%</Badge>
        <Badge variant="warning">要確認</Badge>
        <Badge variant="warning">期限切れ間近</Badge>
        <Badge variant="info">ベータ</Badge>
        <Badge variant="info">更新あり</Badge>
        <Badge variant="destructive">エラー</Badge>
        <Badge variant="destructive">-5%</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">+10%</Badge>
        <Badge variant="destructive">-5%</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">接続済み</Badge>
        <Badge variant="outline">未接続</Badge>
      </div>
    </div>
  ),
};
