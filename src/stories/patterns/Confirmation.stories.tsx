import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertTriangle, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

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
      <h1 className="mb-2 text-2xl font-bold">Confirmation Patterns</h1>
      <p className="text-muted-foreground mb-8">
        破壊的操作や重要な決定の前に確認を求めるパターン。
      </p>

      <div className="grid max-w-3xl gap-8">
        {/* 使い分けガイド */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">確認が必要な操作</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-bold">操作</th>
                  <th className="py-2 text-left font-bold">確認</th>
                  <th className="py-2 text-left font-bold">理由</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2">削除</td>
                  <td className="text-destructive py-2 font-bold">必須</td>
                  <td className="py-2">不可逆操作</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">アカウント削除</td>
                  <td className="text-destructive py-2 font-bold">必須 + 再入力</td>
                  <td className="py-2">致命的な不可逆操作</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">ログアウト</td>
                  <td className="text-warning py-2 font-bold">推奨</td>
                  <td className="py-2">未保存データの損失</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">大量更新</td>
                  <td className="text-warning py-2 font-bold">推奨</td>
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

        {/* 削除確認 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">削除確認ダイアログ</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            何を削除するか明示。アクションボタンは赤で強調。
          </p>

          <AlertDialog open>
            <AlertDialogContent className="static transform-none shadow-none">
              <AlertDialogHeader>
                <AlertDialogTitle>タグを削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  「仕事」タグを削除します。このタグが付いたプラン（12件）からタグが外れます。この操作は取り消せません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive-hover">
                  削除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">削除</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>タグを削除しますか？</AlertDialogTitle>
      <AlertDialogDescription>
        「仕事」タグを削除します。この操作は取り消せません。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>キャンセル</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive ...">
        削除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`}
          </pre>
        </section>

        {/* 危険な操作 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">危険な操作（アイコン付き）</h2>
          <p className="text-muted-foreground mb-4 text-sm">特に重要な操作は警告アイコンで強調。</p>

          <AlertDialog open>
            <AlertDialogContent className="static transform-none shadow-none">
              <AlertDialogHeader>
                <div className="flex items-start gap-4">
                  <div className="bg-destructive-tint flex size-10 shrink-0 items-center justify-center rounded-full">
                    <AlertTriangle className="text-destructive size-5" />
                  </div>
                  <div>
                    <AlertDialogTitle>アカウントを削除しますか？</AlertDialogTitle>
                    <AlertDialogDescription className="mt-2">
                      アカウントを削除すると、すべてのデータ（プラン、タグ、記録）が完全に削除されます。この操作は取り消せません。
                    </AlertDialogDescription>
                  </div>
                </div>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive-hover">
                  <Trash2 className="mr-2 size-4" />
                  アカウントを削除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        {/* 変更破棄 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">変更破棄の確認</h2>
          <p className="text-muted-foreground mb-4 text-sm">編集中の内容を破棄する場合。</p>

          <AlertDialog open>
            <AlertDialogContent className="static transform-none shadow-none">
              <AlertDialogHeader>
                <AlertDialogTitle>変更を破棄しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  保存されていない変更があります。このまま閉じると変更内容は失われます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>編集を続ける</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive-hover">
                  破棄して閉じる
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>何を削除するか具体的に明示</li>
                <li>影響範囲を説明</li>
                <li>破壊的ボタンは赤で強調</li>
                <li>キャンセルを左、実行を右</li>
                <li>ボタンラベルは動詞で（「削除」）</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>「本当によろしいですか？」だけ</li>
                <li>「OK / Cancel」ボタン</li>
                <li>両方のボタンを同じスタイル</li>
                <li>すべての操作に確認を要求</li>
                <li>元に戻せる操作に確認を要求</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ボタンラベル例 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">ボタンラベルの例</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-bold">操作</th>
                  <th className="py-2 text-left font-bold">キャンセル</th>
                  <th className="py-2 text-left font-bold">実行</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2">削除</td>
                  <td className="py-2">キャンセル</td>
                  <td className="text-destructive py-2">削除</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">変更破棄</td>
                  <td className="py-2">編集を続ける</td>
                  <td className="text-destructive py-2">破棄して閉じる</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">ログアウト</td>
                  <td className="py-2">キャンセル</td>
                  <td className="py-2">ログアウト</td>
                </tr>
                <tr>
                  <td className="py-2">送信</td>
                  <td className="py-2">キャンセル</td>
                  <td className="py-2">送信</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* インラインアクション */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">トリガーボタンの例</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            確認ダイアログを開くボタン。破壊的操作はvariant=&quot;destructive&quot;。
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
