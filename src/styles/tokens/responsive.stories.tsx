import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CheckCircle, XCircle } from 'lucide-react';

const meta = {
  title: 'Foundations/Responsive',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Breakpoints: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">ブレークポイント</h1>
      <p className="text-muted-foreground mb-8">Material Design 3 Window Size Classes に基づく</p>

      <div className="grid max-w-5xl gap-8">
        {/* ブレークポイント一覧 */}
        <section>
          <h2 className="mb-4 text-lg font-bold">Tailwind v4 デフォルト</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">Prefix</th>
                  <th className="px-4 py-2 text-left">Min Width</th>
                  <th className="px-4 py-2 text-left">M3対応</th>
                  <th className="px-4 py-2 text-left">用途</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">sm:</code>
                  </td>
                  <td className="px-4 py-2">640px</td>
                  <td className="px-4 py-2">Compact/Medium境界</td>
                  <td className="text-muted-foreground px-4 py-2">タブレット縦</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">md:</code>
                  </td>
                  <td className="px-4 py-2">768px</td>
                  <td className="px-4 py-2">Medium</td>
                  <td className="text-muted-foreground px-4 py-2">タブレット縦</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">lg:</code>
                  </td>
                  <td className="px-4 py-2">1024px</td>
                  <td className="px-4 py-2">Expanded</td>
                  <td className="text-muted-foreground px-4 py-2">デスクトップ</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">xl:</code>
                  </td>
                  <td className="px-4 py-2">1280px</td>
                  <td className="px-4 py-2">Large</td>
                  <td className="text-muted-foreground px-4 py-2">ワイドスクリーン</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">2xl:</code>
                  </td>
                  <td className="px-4 py-2">1536px</td>
                  <td className="px-4 py-2">Extra-large</td>
                  <td className="text-muted-foreground px-4 py-2">超ワイド</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* MEDIA_QUERIES */}
        <section>
          <h2 className="mb-4 text-lg font-bold">useMediaQuery用クエリ</h2>
          <p className="text-muted-foreground mb-4 text-sm">src/lib/breakpoints.ts で定義</p>
          <div className="bg-container space-y-2 rounded-lg p-4 font-mono text-sm">
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.mobile:</span> &apos;(max-width:
              767px)&apos;
            </div>
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.tablet:</span> &apos;(min-width:
              768px) and (max-width: 1023px)&apos;
            </div>
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.desktop:</span>{' '}
              &apos;(min-width: 1024px)&apos;
            </div>
            <div>
              <span className="text-muted-foreground">MEDIA_QUERIES.touch:</span> &apos;(hover:
              none) and (pointer: coarse)&apos;
            </div>
          </div>
        </section>

        {/* 使用例 */}
        <section>
          <h2 className="mb-4 text-lg font-bold">モバイルファースト</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ モバイルファースト（推奨）
<div className="p-4 md:p-6 lg:p-8">
  <h1 className="text-2xl md:text-3xl lg:text-4xl">タイトル</h1>
</div>

// ❌ デスクトップファースト（非推奨）
<div className="lg:p-8 md:p-6 p-4">
`}
          </pre>
        </section>
      </div>
    </div>
  ),
};

export const TouchTargets: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">タッチターゲット</h1>
      <p className="text-muted-foreground mb-8">
        Material Design 3 / Apple HIG アクセシビリティ準拠
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* サイズ一覧 */}
        <section>
          <h2 className="mb-4 text-lg font-bold">サイズ早見表</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-2 text-left">サイズ</th>
                  <th className="px-4 py-2 text-left">Tailwind</th>
                  <th className="px-4 py-2 text-left">ピクセル</th>
                  <th className="px-4 py-2 text-left">用途</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">minimum</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">h-11 w-11</code>
                  </td>
                  <td className="px-4 py-2">44px</td>
                  <td className="text-muted-foreground px-4 py-2">WCAG 2.5.5最小</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-2">standard</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">h-12 w-12</code>
                  </td>
                  <td className="px-4 py-2">48px</td>
                  <td className="text-muted-foreground px-4 py-2">M3推奨（標準）</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">large</td>
                  <td className="px-4 py-2">
                    <code className="bg-container rounded px-2">h-14 w-14</code>
                  </td>
                  <td className="px-4 py-2">56px</td>
                  <td className="text-muted-foreground px-4 py-2">FAB、重要アクション</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 視覚的サンプル */}
        <section>
          <h2 className="mb-4 text-lg font-bold">サイズ比較</h2>
          <div className="flex items-end gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="border-destructive text-destructive flex size-6 items-center justify-center rounded-lg border text-xs">
                ✕
              </div>
              <span className="text-muted-foreground text-xs">24px (NG)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="border-warning text-warning flex size-10 items-center justify-center rounded-lg border text-xs">
                △
              </div>
              <span className="text-muted-foreground text-xs">40px</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="border-success text-success flex size-11 items-center justify-center rounded-lg border text-xs">
                ○
              </div>
              <span className="text-muted-foreground text-xs">44px (min)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-lg text-xs">
                ◎
              </div>
              <span className="text-muted-foreground text-xs">48px (推奨)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-14 items-center justify-center rounded-lg text-xs">
                FAB
              </div>
              <span className="text-muted-foreground text-xs">56px</span>
            </div>
          </div>
        </section>

        {/* レスポンシブタッチ */}
        <section>
          <h2 className="mb-4 text-lg font-bold">レスポンシブタッチターゲット</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ モバイルで大きく、デスクトップで通常サイズ
<Button className="h-12 w-12 sm:h-10 sm:w-10">
  <Icon className="size-6 sm:size-5" />
</Button>

// ✅ SelectTriggerなど
<SelectTrigger className="h-10 w-28 sm:h-8 sm:w-32">
`}
          </pre>
        </section>

        {/* ルール */}
        <section>
          <h2 className="mb-4 text-lg font-bold">ルール</h2>
          <div className="space-y-2">
            <Rule type="do">最小タッチターゲット 44x44px</Rule>
            <Rule type="do">推奨サイズ 48x48px</Rule>
            <Rule type="do">モバイルで常時表示、デスクトップでホバー表示</Rule>
            <Rule type="dont">24px以下のタッチターゲット</Rule>
            <Rule type="dont">ホバーのみでアクセスできるUI（モバイル不可）</Rule>
          </div>
        </section>
      </div>
    </div>
  ),
};

export const HoverMobile: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">ホバー依存UIのモバイル対応</h1>
      <p className="text-muted-foreground mb-8">ホバーで表示されるUIはモバイルで常時表示に</p>

      <div className="grid max-w-5xl gap-8">
        {/* パターン */}
        <section>
          <h2 className="mb-4 text-lg font-bold">実装パターン</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ モバイルで常時表示、デスクトップでホバー時のみ
<button className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
  <TrashIcon />
</button>

// ❌ ホバーのみ（モバイルでアクセス不可）
<button className="opacity-0 group-hover:opacity-100">
`}
          </pre>
        </section>

        {/* デモ */}
        <section>
          <h2 className="mb-4 text-lg font-bold">デモ</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            ウィンドウ幅を変えて確認（640px以下でボタン常時表示）
          </p>
          <div className="bg-card border-border group flex items-center justify-between rounded-lg border p-4">
            <span>リストアイテム</span>
            <button
              type="button"
              className="text-destructive hover:bg-destructive-state-hover rounded-lg p-2 opacity-100 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
            >
              削除
            </button>
          </div>
        </section>

        {/* 固定幅のレスポンシブ化 */}
        <section>
          <h2 className="mb-4 text-lg font-bold">固定幅のレスポンシブ化</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-sm">
            {`// ✅ Tailwind標準クラス使用
<div className="w-72 sm:w-80">        // 288px → 320px
<div className="w-full max-w-sm sm:w-96">  // 全幅 → 384px

// ❌ 任意値の多用は避ける
<div className="w-[25rem]">           // → w-96
<div className="max-w-[85vw]">        // → max-w-72
`}
          </pre>
        </section>
      </div>
    </div>
  ),
};

function Rule({ type, children }: { type: 'do' | 'dont'; children: React.ReactNode }) {
  const Icon = type === 'do' ? CheckCircle : XCircle;
  const color = type === 'do' ? 'text-success' : 'text-destructive';
  const textColor = type === 'do' ? '' : 'text-muted-foreground';

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`mt-1 size-4 shrink-0 ${color}`} />
      <span className={textColor}>{children}</span>
    </div>
  );
}
