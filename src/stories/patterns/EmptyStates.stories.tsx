import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Calendar, FolderOpen, Inbox, Plus, Search, Tag } from 'lucide-react';

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
            アイコン + メッセージ + アクションボタンの構成。
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {/* プランなし */}
            <div className="border-border flex flex-col items-center justify-center rounded-lg border py-12 text-center">
              <Calendar className="text-muted-foreground mb-4 size-12" />
              <h3 className="mb-2 font-bold">プランがありません</h3>
              <p className="text-muted-foreground mb-4 text-sm">
                最初のプランを作成して、
                <br />
                タイムボクシングを始めましょう。
              </p>
              <Button>
                <Plus className="mr-2 size-4" />
                プランを作成
              </Button>
            </div>

            {/* タグなし */}
            <div className="border-border flex flex-col items-center justify-center rounded-lg border py-12 text-center">
              <Tag className="text-muted-foreground mb-4 size-12" />
              <h3 className="mb-2 font-bold">タグがありません</h3>
              <p className="text-muted-foreground mb-4 text-sm">
                タグを作成して、
                <br />
                プランを整理しましょう。
              </p>
              <Button>
                <Plus className="mr-2 size-4" />
                タグを作成
              </Button>
            </div>
          </div>
        </section>

        {/* 検索結果なし */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">検索結果なし</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            検索やフィルターで結果がない場合。検索語の見直しを促す。
          </p>

          <div className="border-border flex flex-col items-center justify-center rounded-lg border py-12 text-center">
            <Search className="text-muted-foreground mb-4 size-12" />
            <h3 className="mb-2 font-bold">検索結果がありません</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              「ミーティング」に一致するプランは見つかりませんでした。
              <br />
              キーワードを変えてお試しください。
            </p>
            <Button variant="outline">検索をクリア</Button>
          </div>
        </section>

        {/* フィルター結果なし */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">フィルター結果なし</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            フィルター適用後に該当データがない場合。
          </p>

          <div className="border-border flex flex-col items-center justify-center rounded-lg border py-12 text-center">
            <FolderOpen className="text-muted-foreground mb-4 size-12" />
            <h3 className="mb-2 font-bold">該当するプランがありません</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              選択したタグに該当するプランはありません。
              <br />
              フィルターを変更してください。
            </p>
            <Button variant="outline">フィルターをリセット</Button>
          </div>
        </section>

        {/* 受信トレイ空 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-bold">完了状態</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            すべて処理済みの場合。ポジティブなメッセージで達成感を演出。
          </p>

          <div className="border-border flex flex-col items-center justify-center rounded-lg border py-12 text-center">
            <Inbox className="text-muted-foreground mb-4 size-12" />
            <h3 className="mb-2 font-bold">すべて完了しました</h3>
            <p className="text-muted-foreground text-sm">
              今日のプランはすべて完了しています。
              <br />
              お疲れさまでした！
            </p>
          </div>
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
            {`// Empty State コンポーネントパターン
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="text-muted-foreground mb-4 size-12" />
      <h3 className="mb-2 font-bold">{title}</h3>
      <p className="text-muted-foreground mb-4 text-sm">{description}</p>
      {action}
    </div>
  );
}

// 使用例
<EmptyState
  icon={Calendar}
  title="プランがありません"
  description="最初のプランを作成して、タイムボクシングを始めましょう。"
  action={<Button><Plus className="mr-2 size-4" />プランを作成</Button>}
/>`}
          </pre>
        </section>
      </div>
    </div>
  ),
};
