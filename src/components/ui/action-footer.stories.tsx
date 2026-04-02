import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Trash2 } from 'lucide-react';

import { Button } from './button';

import { ActionFooter } from './action-footer';

/**
 * ActionFooter - ダイアログ・モーダル・パネルのアクションボタン群レイアウト。
 *
 * モバイル: 縦積み（Primary が上）、デスクトップ: 横並び右寄せ。
 *
 * ## 使い分け
 *
 * | コンテキスト | 使うもの |
 * |---|---|
 * | `<Dialog>` 内 | `DialogFooter`（shadcn 付属） |
 * | `<AlertDialog>` 内 | `AlertDialogFooter`（shadcn 付属） |
 * | カスタムモーダル / createPortal | `ActionFooter`（このコンポーネント） |
 * | Sheet / Drawer | `ActionFooter`（このコンポーネント） |
 */
const meta = {
  title: 'Components/UI/ActionFooter',
  component: ActionFooter,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ActionFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="bg-card rounded-lg p-6" style={{ maxWidth: 400 }}>
      <p className="text-muted-foreground mb-4 text-sm">フォームコンテンツがここに入る</p>
      <ActionFooter>
        <Button variant="outline">キャンセル</Button>
        <Button>保存</Button>
      </ActionFooter>
    </div>
  ),
};

export const Destructive: Story = {
  render: () => (
    <div className="bg-card rounded-lg p-6" style={{ maxWidth: 400 }}>
      <p className="text-muted-foreground mb-4 text-sm">この操作は取り消せません。</p>
      <ActionFooter>
        <Button variant="outline">キャンセル</Button>
        <Button variant="destructive">
          <Trash2 className="size-4" />
          削除
        </Button>
      </ActionFooter>
    </div>
  ),
};

export const WithBorder: Story = {
  name: 'ボーダー付き（セパレートフッター）',
  render: () => (
    <div className="bg-card rounded-lg" style={{ maxWidth: 400 }}>
      <div className="p-6">
        <p className="text-muted-foreground text-sm">コンテンツエリア</p>
      </div>
      <ActionFooter className="border-border border-t px-6 py-4">
        <Button variant="outline">キャンセル</Button>
        <Button>適用</Button>
      </ActionFooter>
    </div>
  ),
};

export const AllPatterns: Story = {
  name: '全パターン',
  render: () => (
    <div className="space-y-6">
      <div className="bg-card rounded-lg p-6" style={{ maxWidth: 400 }}>
        <p className="text-foreground mb-1 text-sm">基本（Cancel + Save）</p>
        <ActionFooter>
          <Button variant="outline">キャンセル</Button>
          <Button>保存</Button>
        </ActionFooter>
      </div>

      <div className="bg-card rounded-lg p-6" style={{ maxWidth: 400 }}>
        <p className="text-foreground mb-1 text-sm">破壊的操作</p>
        <ActionFooter>
          <Button variant="outline">キャンセル</Button>
          <Button variant="destructive">削除</Button>
        </ActionFooter>
      </div>

      <div className="bg-card rounded-lg" style={{ maxWidth: 400 }}>
        <div className="p-6">
          <p className="text-foreground text-sm">ボーダー付き</p>
        </div>
        <ActionFooter className="border-border border-t px-6 py-4">
          <Button variant="outline">キャンセル</Button>
          <Button>適用</Button>
        </ActionFooter>
      </div>

      <div className="bg-card rounded-lg p-6" style={{ maxWidth: 400 }}>
        <p className="text-foreground mb-1 text-sm">3ボタン</p>
        <ActionFooter>
          <Button variant="ghost">後で</Button>
          <Button variant="outline">いいえ</Button>
          <Button>はい</Button>
        </ActionFooter>
      </div>
    </div>
  ),
};
