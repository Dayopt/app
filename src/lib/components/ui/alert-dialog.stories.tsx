import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertTriangle, Clock, LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';
import { Button } from './button';
import { Input } from './input';

const meta = {
  title: 'Components/UI/Overlays/AlertDialog',
  component: AlertDialog,
  tags: [],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// ヘルパーコンポーネント
// ---------------------------------------------------------------------------

function DeleteConfirmExample() {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="mr-2 size-4" />
          タグを削除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>タグを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            このタグを削除すると、関連する全てのプランと記録からタグが解除されます。この操作は取り消せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive-hover">
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SessionTimeoutExample() {
  const [open, setOpen] = useState(false);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        セッション警告を表示
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
              <Clock className="text-warning h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center">
              セッションがまもなく期限切れになります
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              セキュリティのため、まもなくログアウトされます。
              <span className="text-foreground mt-2 block text-2xl font-medium">
                {formatTime(299)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel className="gap-2">
              <LogOut className="h-4 w-4" />
              ログアウト
            </AlertDialogCancel>
            <AlertDialogAction>セッションを延長</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AccountDeletionExample() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        アカウント削除
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-5 w-5" />
              アカウントを削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  この操作は30日後に完了します。その間にログインすると削除をキャンセルできます。
                </p>
                <div className="bg-muted rounded-2xl p-4">
                  <h4 className="text-foreground mb-2 text-sm font-medium">猶予期間について</h4>
                  <p className="text-xs">
                    30日間の猶予期間中はデータが保持されます。期間終了後、全てのデータが完全に削除されます。
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-foreground text-sm font-normal">
                    確認のため「DELETE」と入力してください
                  </label>
                  <Input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive-hover"
            >
              アカウントを削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stories — Canvas は純粋なコンポーネント描画のみ
// ---------------------------------------------------------------------------

/** 基本的な削除確認ダイアログ。最小構成の例。 */
export const Default: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">削除</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive-hover">
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', { name: '削除' });
    await userEvent.click(trigger);

    const body = within(document.body);
    await expect(await body.findByText('本当に削除しますか？')).toBeVisible();

    const cancelButton = await body.findByRole('button', { name: 'キャンセル' });
    await userEvent.click(cancelButton);

    await expect(body.queryByText('本当に削除しますか？')).not.toBeInTheDocument();
  },
};

/** 削除確認ダイアログ。不可逆な削除アクションで使用。AlertDialogActionに `bg-destructive` スタイルを適用。実装例: TagDeleteConfirm */
export const DeleteConfirm: Story = {
  render: () => <DeleteConfirmExample />,
};

/** セッション期限切れ警告ダイアログ。中央配置のアイコン、カウントダウン表示。ユーザーに延長 or ログアウトを選択させる。実装: SessionTimeoutDialog */
export const SessionTimeout: Story = {
  render: () => <SessionTimeoutExample />,
};

/** アカウント削除ダイアログ（GDPR対応）。確認テキスト入力（"DELETE"）を含む高リスク操作。AlertDialogDescription内に `asChild` でフォームを配置。実装: AccountDeletionDialog */
export const AccountDeletion: Story = {
  render: () => <AccountDeletionExample />,
};

// ---------------------------------------------------------------------------
// AllPatterns — Canvas用の全パターンカタログ
// ---------------------------------------------------------------------------

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">削除</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive-hover">
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeleteConfirmExample />
      <SessionTimeoutExample />
      <AccountDeletionExample />
    </div>
  ),
};
