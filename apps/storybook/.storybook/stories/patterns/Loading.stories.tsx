import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Spinner } from '@dayopt/components';

const meta = {
  title: 'Patterns/Loading',
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
      <h1 className="mb-2 text-2xl font-medium">Loading Patterns</h1>
      <p className="text-muted-foreground mb-8">
        非同期処理中の表示パターン。Skeleton、Spinner、Progressの使い分け。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* 使い分けガイド */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">使い分けガイド</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">パターン</th>
                  <th className="py-2 text-left font-medium">用途</th>
                  <th className="py-2 text-left font-medium">推奨時間</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">Skeleton</td>
                  <td className="py-2">コンテンツのレイアウトプレビュー</td>
                  <td className="py-2">300ms〜3s</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">Spinner</td>
                  <td className="py-2">短時間の処理、ボタン内</td>
                  <td className="py-2">〜2s</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">Progress</td>
                  <td className="py-2">進捗が計測可能な長時間処理</td>
                  <td className="py-2">3s〜</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Pulse</td>
                  <td className="py-2">画像やメディアの読み込み</td>
                  <td className="py-2">〜5s</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Skeleton */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Skeleton（推奨）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            コンテンツの形状を模したローディング。レイアウトシフトを防ぐ。
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {/* カードスケルトン */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">カード</h3>
              <div className="border-border space-y-2 rounded-lg border p-4">
                <div className="animate-shimmer h-4 w-3/4 rounded-lg" />
                <div className="animate-shimmer h-3 w-full rounded-lg" />
                <div className="animate-shimmer h-3 w-5/6 rounded-lg" />
              </div>
            </div>

            {/* リストスケルトン */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">リスト</h3>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="animate-shimmer size-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="animate-shimmer h-4 w-1/3 rounded-lg" />
                      <div className="animate-shimmer h-3 w-2/3 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 画像スケルトン */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">画像</h3>
              <div className="animate-shimmer aspect-video rounded-lg" />
            </div>

            {/* テーブルスケルトン */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">テーブル</h3>
              <div className="space-y-2">
                <div className="border-border flex gap-4 border-b pb-2">
                  <div className="animate-shimmer h-4 w-1/4 rounded-lg" />
                  <div className="animate-shimmer h-4 w-1/3 rounded-lg" />
                  <div className="animate-shimmer h-4 w-1/4 rounded-lg" />
                </div>
                {[1, 2].map((i) => (
                  <div key={i} className="flex gap-4 py-2">
                    <div className="animate-shimmer h-3 w-1/4 rounded-lg" />
                    <div className="animate-shimmer h-3 w-1/3 rounded-lg" />
                    <div className="animate-shimmer h-3 w-1/4 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// Skeletonパターン
<div className="animate-shimmer h-4 w-3/4 rounded-lg" />

// 複数行
<div className="space-y-2">
  <div className="animate-shimmer h-4 w-full rounded-lg" />
  <div className="animate-shimmer h-4 w-2/3 rounded-lg" />
</div>

// 円形（アバター）
<div className="animate-shimmer size-10 rounded-full" />`}
          </pre>
        </section>

        {/* Spinner */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Spinner</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            短時間の処理に使用。ボタン内やインライン表示に最適。
          </p>

          <div className="flex flex-wrap items-center gap-6">
            <div className="space-y-2 text-center">
              <Spinner className="size-3.5" />
              <p className="text-muted-foreground text-xs">size-3.5</p>
            </div>
            <div className="space-y-2 text-center">
              <Spinner />
              <p className="text-muted-foreground text-xs">size-4 (default)</p>
            </div>
            <div className="space-y-2 text-center">
              <Spinner className="size-6" />
              <p className="text-muted-foreground text-xs">size-6</p>
            </div>
          </div>

          <h3 className="mt-6 mb-2 text-sm font-medium">ボタン内Spinner</h3>
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 opacity-70"
            >
              <Spinner className="text-primary-foreground" />
              保存中...
            </button>
            <button
              type="button"
              disabled
              className="border-border inline-flex items-center gap-2 rounded-lg border px-4 py-2 opacity-70"
            >
              <Spinner />
              読み込み中...
            </button>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`import { Spinner } from '@dayopt/components';

// ボタン内
<Button disabled>
  <Spinner />
  保存中...
</Button>

// インライン
<div className="flex items-center gap-2">
  <Spinner className="size-3.5" />
  <span>読み込み中...</span>
</div>`}
          </pre>
        </section>

        {/* Pulse */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Pulse（フォールバック）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            シンプルなフェード効果。shimmerが使えない場合のフォールバック。
          </p>

          <div className="flex gap-4">
            <div className="bg-muted h-24 w-24 animate-pulse rounded-lg" />
            <div className="space-y-2">
              <div className="bg-muted h-4 w-32 animate-pulse rounded-lg" />
              <div className="bg-muted h-3 w-48 animate-pulse rounded-lg" />
              <div className="bg-muted h-3 w-40 animate-pulse rounded-lg" />
            </div>
          </div>

          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// Pulseパターン（shimmerより軽量）
<div className="bg-muted h-4 animate-pulse rounded-lg" />`}
          </pre>
        </section>

        {/* ベストプラクティス */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ベストプラクティス</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>300ms未満の処理はローディング不要</li>
                <li>コンテンツの形状を模したSkeleton</li>
                <li>処理中はボタンをdisabledに</li>
                <li>長時間処理は進捗を表示</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>全画面を覆うローディング</li>
                <li>進捗不明の長時間Spinner</li>
                <li>複数のローディング表示</li>
                <li>レイアウトシフトを起こす</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
};
