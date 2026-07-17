import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@dayopt/components';

/**
 * Dialog - モーダルダイアログ。
 *
 * ## モバイルSheetのガイドライン
 *
 * | パターン | 閉じ方 | modal |
 * |----------|--------|-------|
 * | 検索 | 一時的な検索状態を破棄する「キャンセル」 | true |
 * | 作成・編集フォーム | 「キャンセル」+ 主要action | true |
 * | 自動保存の詳細 | 閉じるicon | true |
 * | 即時確定picker | 選択で閉じる | true |
 * | 背景と同時操作する補助panel | 閉じるiconまたはswipe | false |
 *
 * **原則**: mobile bottom sheetは常にmodal。背景と同時操作するUIはpanel / popoverを使う。
 */
const meta = {
  title: 'Shared/Components/Overlays/Dialog',
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

export const WithoutOverlay: Story = {
  render: () => (
    <Dialog responsive="dialog" modal={false}>
      <DialogTrigger asChild>
        <Button variant="outline">背景オーバーレイなし</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>背景オーバーレイなし</DialogTitle>
          <DialogDescription>背景を暗く覆わずに表示するダイアログです。</DialogDescription>
        </DialogHeader>
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

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <Dialog key={size}>
          <DialogTrigger asChild>
            <Button variant="outline">size=&quot;{size}&quot;</Button>
          </DialogTrigger>
          <DialogContent size={size}>
            <DialogHeader>
              <DialogTitle>Size: {size}</DialogTitle>
              <DialogDescription>
                max-width が {size} に設定されたダイアログです。
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p>コンテンツ領域</p>
            </div>
            <DialogFooter>
              <Button variant="outline">キャンセル</Button>
              <Button>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  ),
};

export const ResponsiveAuto: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">responsive=&quot;auto&quot;（デフォルト）</Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>レスポンシブ自動</DialogTitle>
          <DialogDescription>
            PC では Dialog、モバイルでは Drawer として表示されます。
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>ブラウザ幅を変えて確認してください。</p>
        </div>
        <DialogFooter>
          <Button variant="outline">キャンセル</Button>
          <Button>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const ForceDialog: Story = {
  render: () => (
    <Dialog responsive="dialog">
      <DialogTrigger asChild>
        <Button variant="outline">responsive=&quot;dialog&quot;</Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>常に Dialog</DialogTitle>
          <DialogDescription>モバイルでも Dialog として表示されます。</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>Settings のような PC 専用画面に使います。</p>
        </div>
        <DialogFooter>
          <Button variant="outline">キャンセル</Button>
          <Button>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const ForceDrawer: Story = {
  render: () => (
    <Dialog responsive="drawer">
      <DialogTrigger asChild>
        <Button variant="outline">responsive=&quot;drawer&quot;</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>常に Drawer</DialogTitle>
          <DialogDescription>PC でも Drawer として表示されます。</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>モバイル専用の体験に使います。</p>
        </div>
        <DialogFooter>
          <Button variant="outline">キャンセル</Button>
          <Button>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/** 入力や長い一覧を扱うモバイル向けの全高Drawer。 */
export const FullHeightDrawer: Story = {
  render: () => (
    <Dialog responsive="drawer">
      <DialogTrigger asChild>
        <Button variant="outline">全高Drawer</Button>
      </DialogTrigger>
      <DialogContent mobilePresentation="full-height" showCloseButton={false}>
        <DialogHeader className="border-border flex-row items-center justify-between border-b pb-4">
          <DialogTitle>検索</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">検索結果</div>
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
            <DialogTitle>新しいブロック</DialogTitle>
            <DialogDescription>新しいブロックを作成します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="block-name">ブロック名</Label>
              <Input id="block-name" placeholder="ブロック名を入力" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline">キャンセル</Button>
            <Button>作成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog responsive="dialog" modal={false}>
        <DialogTrigger asChild>
          <Button variant="outline">背景オーバーレイなし</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ショートカット一覧</DialogTitle>
            <DialogDescription>背景を維持したまま補助情報を表示します。</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog responsive="drawer">
        <DialogTrigger asChild>
          <Button variant="outline">全高Drawer</Button>
        </DialogTrigger>
        <DialogContent mobilePresentation="full-height" showCloseButton={false}>
          <DialogHeader className="border-border flex-row items-center justify-between border-b pb-4">
            <DialogTitle>検索</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost">キャンセル</Button>
            </DialogClose>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">検索結果</div>
        </DialogContent>
      </Dialog>
    </div>
  ),
};
