import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WifiOff } from 'lucide-react';

import { ErrorState } from '@/lib/components/common/ErrorState';
import { Button } from '@/lib/components/ui/button';

/**
 * インラインエラー状態のパターンカタログ
 *
 * ErrorState は tRPC クエリの isError 等、データ取得失敗時に使用する。
 * ErrorBoundary（コンポーネントクラッシュ）や error.tsx（ページエラー）とは別レイヤー。
 *
 * ## エラーUI の使い分け
 *
 * | レイヤー | コンポーネント | トリガー |
 * |----------|----------------|----------|
 * | ページクラッシュ | `error.tsx` | Next.js error boundary |
 * | コンポーネントクラッシュ | `ErrorBoundary` | React render exception |
 * | データ取得失敗 | `ErrorState` | tRPC `isError` |
 * | Mutation 失敗 | Toast (sonner) | `onError` callback |
 */
const meta = {
  title: 'Patterns/ErrorStates',
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
      <h1 className="mb-2 text-2xl font-medium">Error States</h1>
      <p className="text-muted-foreground mb-8">
        データ取得失敗時のUI。リトライアクションでユーザーを回復に誘導する。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* エラーUI の使い分け */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">エラーUI の使い分け</h2>
          <div className="overflow-x-auto">
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">レイヤー</th>
                  <th className="py-2 text-left font-medium">コンポーネント</th>
                  <th className="py-2 text-left font-medium">トリガー</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">ページクラッシュ</td>
                  <td className="py-2">
                    <code>error.tsx</code>
                  </td>
                  <td className="py-2">Next.js error boundary</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">コンポーネントクラッシュ</td>
                  <td className="py-2">
                    <code>ErrorBoundary</code>
                  </td>
                  <td className="py-2">React render exception</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="bg-state-active py-2 font-medium">データ取得失敗</td>
                  <td className="bg-state-active py-2">
                    <code>ErrorState</code>
                  </td>
                  <td className="bg-state-active py-2">
                    tRPC <code>isError</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Mutation 失敗</td>
                  <td className="py-2">Toast (sonner)</td>
                  <td className="py-2">
                    <code>onError</code> callback
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 基本パターン */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">基本パターン</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            ErrorState コンポーネントを使用。icon + title + description + retry で構成。
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-border rounded-lg border py-6">
              <ErrorState
                title="データを読み込めなかった"
                description="もう一度試して"
                onRetry={() => {}}
              />
            </div>

            <div className="border-border rounded-lg border py-6">
              <ErrorState
                icon={WifiOff}
                title="ネットワークに接続できない"
                description="インターネット接続を確認して"
                onRetry={() => {}}
              />
            </div>
          </div>
        </section>

        {/* サイズ比較 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">サイズバリエーション</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            用途に応じて3段階のサイズを使い分け。
          </p>

          <div className="overflow-x-auto">
            <table className="mb-6 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">サイズ</th>
                  <th className="py-2 text-left font-medium">用途</th>
                  <th className="py-2 text-left font-medium">アイコン</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">sm</td>
                  <td className="py-2">テーブル内、カード内</td>
                  <td className="py-2">size-8 (32px)</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">md（デフォルト）</td>
                  <td className="py-2">セクション内、一般的なエラー</td>
                  <td className="py-2">size-8 (32px)</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">lg</td>
                  <td className="py-2">フルページ</td>
                  <td className="py-2">size-8 (32px)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <div key={size} className="border-border rounded-lg border py-4">
                <p className="text-muted-foreground mb-2 text-center text-xs font-medium">{size}</p>
                <ErrorState title="読み込めなかった" onRetry={() => {}} size={size} />
              </div>
            ))}
          </div>
        </section>

        {/* カード内（centered） */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">中央配置（centered）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            カードやテーブル内で使う場合、centered で水平・垂直中央に配置。
          </p>

          <div className="border-border h-64 rounded-lg border">
            <ErrorState
              title="統計を読み込めなかった"
              description="しばらくしてからもう一度試して"
              onRetry={() => {}}
              size="sm"
              centered
            />
          </div>
        </section>

        {/* カスタムアクション */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">カスタムアクション</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            actions prop でリトライボタン以外のアクションを配置。
          </p>

          <div className="border-border rounded-lg border py-6">
            <ErrorState
              title="データを読み込めなかった"
              description="ネットワーク接続を確認して"
              actions={
                <div className="flex justify-center gap-2">
                  <Button variant="outline">再試行</Button>
                  <Button variant="ghost">ホームに戻る</Button>
                </div>
              }
            />
          </div>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>リトライアクションを常に提供</li>
                <li>具体的なエラー原因を説明</li>
                <li>ErrorState を使って統一的なUIに</li>
                <li>isError チェックを empty の前に配置</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>isError を無視して空状態と混同</li>
                <li>アドホックなエラーUIを各所で組み立て</li>
                <li>リトライなしでエラーを表示して放置</li>
                <li>console.log でのエラー表示</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 実装例 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">実装例</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-xs">
            {`import { ErrorState } from '@/lib/components/common/ErrorState';

// tRPC クエリのエラーハンドリング
const { data, isPending, isError, refetch } = api.stats.get.useQuery();

if (isPending) return <Skeleton />;

if (isError) {
  return (
    <ErrorState
      title={t('error.inline.title')}
      onRetry={() => refetch()}
      size="sm"
      centered
    />
  );
}

// カスタムアクション
<ErrorState
  title="接続できなかった"
  actions={
    <div className="flex gap-2">
      <Button variant="outline">再試行</Button>
      <Button variant="ghost">ホームに戻る</Button>
    </div>
  }
/>`}
          </pre>
        </section>
      </div>
    </div>
  ),
};
