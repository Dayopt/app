import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

/**
 * Dialog - モーダルダイアログ。
 *
 * ## 閉じるボタン（×）のガイドライン
 *
 * | パターン | 閉じるボタン | 理由 |
 * |----------|-------------|------|
 * | フォーム・設定ダイアログ | あり（デフォルト） | コンテンツ量が多く、フッターが画面外になりうる |
 * | 確認ダイアログ（AlertDialog） | なし | ユーザーに選択を強制する（Cancel/OK で十分） |
 * | コマンドパレット | なし | ESC キーが標準操作 |
 * | フルスクリーン Sheet（モバイル） | ヘッダーに配置 | デフォルト位置ではなくヘッダーUI内に統合 |
 * | カスタムレイアウト（サイドバー付き等） | showCloseButton={false} + DialogClose でカスタム配置 | デフォルト位置がコンテンツと干渉する場合 |
 *
 * **原則**: スクロールが発生しうるモーダル → 閉じるボタンあり、小さい確認ダイアログ → なし
 */
const meta = {
  title: 'Components/UI/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">ダイアログを開く</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ダイアログタイトル</DialogTitle>
          <DialogDescription>ここにダイアログの説明が入ります。</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>ダイアログのコンテンツがここに表示されます。</p>
        </div>
        <DialogFooter>
          <Button type="submit">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // トリガーボタンをクリックしてダイアログを開く
    const triggerButton = canvas.getByRole('button', { name: /ダイアログを開く/i });
    await userEvent.click(triggerButton);

    // ダイアログのコンテンツを確認（ポータル経由）
    const body = within(document.body);
    await expect(body.getByText('ダイアログタイトル')).toBeInTheDocument();
    await expect(body.getByText('ここにダイアログの説明が入ります。')).toBeInTheDocument();

    // 閉じるボタン（X）でダイアログを閉じる
    const closeButton = body.getByRole('button', { name: /close/i });
    await userEvent.click(closeButton);
  },
};

export const WithForm: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>プロフィール編集</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>プロフィール編集</DialogTitle>
          <DialogDescription>プロフィール情報を更新します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">名前</Label>
            <Input id="name" defaultValue="山田太郎" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" type="email" defaultValue="taro@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline">キャンセル</Button>
          <Button type="submit">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">閉じるボタンなし</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>閉じるボタンなし</DialogTitle>
          <DialogDescription>閉じるボタンを非表示にしたダイアログです。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">閉じる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const CustomWidth: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">大きなダイアログ</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>大きなダイアログ</DialogTitle>
          <DialogDescription>max-w-3xlを指定して幅を広げています。</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>より多くのコンテンツを表示できます。</p>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">基本のダイアログ</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>タイトル</DialogTitle>
            <DialogDescription>説明テキスト</DialogDescription>
          </DialogHeader>
          <div className="py-4">コンテンツ</div>
          <DialogFooter>
            <Button>確認</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button>新規作成</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規タスク</DialogTitle>
            <DialogDescription>新しいタスクを作成します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-name">タスク名</Label>
              <Input id="task-name" placeholder="タスク名を入力" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline">キャンセル</Button>
            <Button>作成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  ),
};
