import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar, FolderOpen, Inbox, Search, Tag } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'Patterns/EmptyStates',
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
      <h1 className="mb-2 text-2xl font-bold">Empty States</h1>
      <p className="text-muted-foreground mb-8">
        データがない状態のUI。ユーザーを次のアクションに誘導する。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* 基本パターン */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">基本パターン</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            EmptyState コンポーネントを使用。icon + title + description + action で構成。
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {/* プランなし */}
            <div className="border-border rounded-lg border py-6">
              <EmptyState
                icon={Calendar}
                title="プランがありません"
                description="最初のプランを作成して、タイムボクシングを始めましょう。"
                actionLabel="プランを作成"
                onAction={() => {}}
              />
            </div>

            {/* タグなし */}
            <div className="border-border rounded-lg border py-6">
              <EmptyState
                icon={Tag}
                title="タグがありません"
                description="タグを作成して、プランを整理しましょう。"
                actionLabel="タグを作成"
                onAction={() => {}}
              />
            </div>
          </div>
        </section>

        {/* 検索結果なし */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">検索結果なし</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            検索やフィルターで結果がない場合。検索語の見直しを促す。
          </p>

          <div className="border-border rounded-lg border py-6">
            <EmptyState
              icon={Search}
              title="検索結果がありません"
              description="「ミーティング」に一致するプランは見つかりませんでした。キーワードを変えてお試しください。"
              actions={<Button variant="outline">検索をクリア</Button>}
            />
          </div>
        </section>

        {/* フィルター結果なし */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">フィルター結果なし</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            フィルター適用後に該当データがない場合。
          </p>

          <div className="border-border rounded-lg border py-6">
            <EmptyState
              icon={FolderOpen}
              title="該当するプランがありません"
              description="選択したタグに該当するプランはありません。フィルターを変更してください。"
              actions={<Button variant="outline">フィルターをリセット</Button>}
            />
          </div>
        </section>

        {/* 完了状態 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">完了状態</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            すべて処理済みの場合。ポジティブなメッセージで達成感を演出。
          </p>

          <div className="border-border rounded-lg border py-6">
            <EmptyState
              icon={Inbox}
              title="すべて完了しました"
              description="今日のプランはすべて完了しています。お疲れさまでした！"
            />
          </div>
        </section>

        {/* サイズ比較 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">サイズバリエーション</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            用途に応じて3段階のサイズを使い分け。
          </p>

          <div className="overflow-x-auto">
            <table className="mb-6 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-bold">サイズ</th>
                  <th className="py-2 text-left font-bold">用途</th>
                  <th className="py-2 text-left font-bold">アイコン</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-bold">sm</td>
                  <td className="py-2">テーブル内、カード内</td>
                  <td className="py-2">size-10 (40px)</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-bold">md（デフォルト）</td>
                  <td className="py-2">セクション内、一般的な空状態</td>
                  <td className="py-2">size-12 (48px)</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold">lg</td>
                  <td className="py-2">フルページ</td>
                  <td className="py-2">size-16 (64px)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="border-border rounded-lg border py-4">
              <p className="text-muted-foreground mb-2 text-center text-xs font-bold">
                sm（テーブル内）
              </p>
              <EmptyState icon={Inbox} title="アイテムがありません" size="sm" />
            </div>
            <div className="border-border rounded-lg border py-4">
              <p className="text-muted-foreground mb-2 text-center text-xs font-bold">md（標準）</p>
              <EmptyState icon={Inbox} title="アイテムがありません" />
            </div>
            <div className="border-border rounded-lg border py-4">
              <p className="text-muted-foreground mb-2 text-center text-xs font-bold">
                lg（フルページ）
              </p>
              <EmptyState icon={Inbox} title="アイテムがありません" size="lg" />
            </div>
          </div>
        </section>

        {/* 中央配置 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">中央配置（centered）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            テーブルやカード内で使う場合、centered で水平・垂直中央に配置。
          </p>

          <div className="border-border h-64 rounded-lg border">
            <EmptyState
              icon={Inbox}
              title="アイテムがありません"
              description="新しいアイテムを作成してください。"
              size="sm"
              centered
            />
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// テーブル内（中央配置 + sm）
<div className="h-64">
  <EmptyState
    icon={Inbox}
    title="アイテムがありません"
    size="sm"
    centered
  />
</div>`}
          </pre>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>次のアクションを明示</li>
                <li>状況に応じたメッセージ</li>
                <li>アイコンで視覚的に伝える</li>
                <li>ポジティブな言葉選び</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-bold">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>「データがありません」だけ</li>
                <li>空白のまま放置</li>
                <li>エラーと混同させる</li>
                <li>ユーザーを責める表現</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 実装例 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">実装例</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-xs">
            {`import { EmptyState } from '@/components/common/EmptyState';

// 標準（size="md"）
<EmptyState
  icon={Calendar}
  title="プランがありません"
  description="最初のプランを作成して..."
  actionLabel="プランを作成"
  onAction={handleCreate}
/>

// カスタムアクション
<EmptyState
  icon={Search}
  title="検索結果がありません"
  actions={<Button variant="outline">検索をクリア</Button>}
/>

// テーブル内（size="sm" + centered）
<EmptyState
  icon={Inbox}
  title="アイテムがありません"
  size="sm"
  centered
/>`}
          </pre>
        </section>
      </div>
    </div>
  ),
};
