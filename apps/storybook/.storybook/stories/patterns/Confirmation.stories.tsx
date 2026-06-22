import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Archive, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/lib/components/ui/confirm-dialog';
import { Button } from '@dayopt/components';

const meta = {
  title: 'Patterns/Confirmation',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">Confirmation Patterns</h1>
      <p className="text-muted-foreground mb-8">
        破壊的操作や重要な決定の前に確認を求めるパターン。ConfirmDialog コンポーネントを使用。
      </p>

      <div className="grid max-w-3xl gap-8">
        {/* 使い分けガイド */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">確認が必要な操作</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">操作</th>
                  <th className="py-2 text-left font-medium">variant</th>
                  <th className="py-2 text-left font-medium">理由</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2">削除</td>
                  <td className="text-destructive py-2 font-medium">destructive</td>
                  <td className="py-2">不可逆操作</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">アカウント削除</td>
                  <td className="text-destructive py-2 font-medium">destructive + icon</td>
                  <td className="py-2">致命的な不可逆操作</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">変更破棄・ログアウト</td>
                  <td className="text-warning py-2 font-medium">warning</td>
                  <td className="py-2">未保存データの損失</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">大量更新</td>
                  <td className="text-warning py-2 font-medium">warning</td>
                  <td className="py-2">影響範囲が大きい</td>
                </tr>
                <tr>
                  <td className="py-2">保存・作成</td>
                  <td className="py-2">不要</td>
                  <td className="py-2">取り消し可能</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ConfirmDialog API */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ConfirmDialog API</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            variant に応じてスタイル・アイコン・ラベルが自動設定される。カスタマイズも可能。
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">variant</th>
                  <th className="py-2 text-left font-medium">アイコン</th>
                  <th className="py-2 text-left font-medium">確認ボタン</th>
                  <th className="py-2 text-left font-medium">デフォルトラベル</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">destructive</td>
                  <td className="py-2">AlertTriangle（赤枠）</td>
                  <td className="py-2">赤ボタン</td>
                  <td className="py-2">i18n: common.actions.delete</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">warning</td>
                  <td className="py-2">AlertTriangle（黄枠）</td>
                  <td className="py-2">黄ボタン</td>
                  <td className="py-2">i18n: common.actions.confirm</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">default</td>
                  <td className="py-2">AlertTriangle（灰背景）</td>
                  <td className="py-2">Primary ボタン</td>
                  <td className="py-2">i18n: common.actions.confirm</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 削除確認 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">削除確認ダイアログ</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            何を削除するか明示。variant=&quot;destructive&quot; で赤いボタン。
          </p>

          <DeleteConfirmDemo />

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<ConfirmDialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  onConfirm={handleDelete}
  title="タグを削除する？"
  description="「仕事」タグを削除する。この操作は取り消せない"
  variant="destructive"
/>`}
          </pre>
        </section>

        {/* 危険な操作（カスタムアイコン） */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">危険な操作（カスタムアイコン）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            特に重要な操作は icon prop でカスタムアイコンを指定。
          </p>

          <DangerousConfirmDemo />

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<ConfirmDialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  onConfirm={handleDelete}
  title="アカウントを削除する？"
  description="すべてのデータが完全に削除される"
  variant="destructive"
  icon={Trash2}
  confirmLabel="アカウントを削除"
/>`}
          </pre>
        </section>

        {/* 変更破棄 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">変更破棄の確認</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            編集中の内容を破棄する場合。variant=&quot;warning&quot; で警告スタイル。
          </p>

          <DiscardConfirmDemo />

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<ConfirmDialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  onConfirm={handleDiscard}
  title="変更を破棄する？"
  description="保存されていない変更がある"
  variant="warning"
  confirmLabel="破棄して閉じる"
  cancelLabel="編集を続ける"
/>`}
          </pre>
        </section>

        {/* 非同期処理 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">非同期処理（Loading）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            onConfirm が async の場合、自動でローディング状態を表示。loadingLabel
            でカスタマイズ可能。
          </p>

          <AsyncConfirmDemo />

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`const handleDelete = async () => {
  await api.tags.delete.mutateAsync({ id: tagId });
};

<ConfirmDialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  onConfirm={handleDelete}
  title="タグを削除する？"
  variant="destructive"
  loadingLabel="削除中..."
/>`}
          </pre>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>何を削除するか具体的に明示</li>
                <li>影響範囲を description で説明</li>
                <li>variant で操作の危険度を表現</li>
                <li>ボタンラベルは動詞で（「削除」）</li>
                <li>非同期処理は loadingLabel を設定</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>「本当によろしいですか？」だけ</li>
                <li>「OK / Cancel」ボタン</li>
                <li>すべての操作に確認を要求</li>
                <li>元に戻せる操作に確認を要求</li>
                <li>AlertDialog を直接組み立てない</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ボタンラベル例 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ボタンラベルの例</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            confirmLabel / cancelLabel を省略すると、variant に応じた i18n
            キーからラベルが自動解決される。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">操作</th>
                  <th className="py-2 text-left font-medium">cancelLabel</th>
                  <th className="py-2 text-left font-medium">confirmLabel</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2">削除</td>
                  <td className="py-2">（自動: キャンセル）</td>
                  <td className="text-destructive py-2">（自動: 削除）</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">変更破棄</td>
                  <td className="py-2">編集を続ける</td>
                  <td className="text-warning py-2">破棄して閉じる</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">アーカイブ</td>
                  <td className="py-2">（自動: キャンセル）</td>
                  <td className="py-2">アーカイブ</td>
                </tr>
                <tr>
                  <td className="py-2">確認</td>
                  <td className="py-2">（自動: キャンセル）</td>
                  <td className="py-2">（自動: 確認）</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* トリガーボタンの例 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">トリガーボタンの例</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            確認ダイアログを開くボタン。破壊的操作は variant=&quot;destructive&quot;。
          </p>

          <div className="flex gap-2">
            <Button variant="destructive">
              <Trash2 className="mr-2 size-4" />
              削除
            </Button>
            <Button variant="outline">ログアウト</Button>
            <Button variant="ghost" icon className="text-destructive">
              <Trash2 className="size-4" />
            </Button>
          </div>
        </section>
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function DeleteConfirmDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        削除確認を開く
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="タグを削除する？"
        description="「仕事」タグを削除する。このタグが付いたエントリー（12件）からタグが外れる。この操作は取り消せない"
        variant="destructive"
      />
    </>
  );
}

function DangerousConfirmDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        アカウント削除を開く
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="アカウントを削除する？"
        description="アカウントを削除すると、すべてのデータ（エントリー、タグ、記録）が完全に削除される。この操作は取り消せない"
        variant="destructive"
        icon={Trash2}
        confirmLabel="アカウントを削除"
      />
    </>
  );
}

function DiscardConfirmDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        変更破棄を開く
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="変更を破棄する？"
        description="保存されていない変更がある。このまま閉じると変更内容は失われる"
        variant="warning"
        confirmLabel="破棄して閉じる"
        cancelLabel="編集を続ける"
        icon={Archive}
      />
    </>
  );
}

function AsyncConfirmDemo() {
  const [open, setOpen] = useState(false);
  const handleConfirm = async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setOpen(false);
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        非同期削除を開く
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="タグを削除する？"
        description="「仕事」タグを削除する。この操作は取り消せない"
        variant="destructive"
        loadingLabel="削除中..."
      />
    </>
  );
}
