import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Foundations/Elevation',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const AllElevations: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Elevation（高さ）</h1>
      <p className="text-muted-foreground mb-8">
        UI要素のz軸上の位置を表現。高いほど前面に浮き出る。
      </p>

      <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-6">
        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Level 0</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card size-24 rounded-lg shadow-none" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-none</code>
          <p className="text-muted-foreground mt-2 text-xs">
            ベース面、
            <br />
            背景要素
          </p>
        </div>

        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Level 1</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card size-24 rounded-lg shadow-xs" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-xs</code>
          <p className="text-muted-foreground mt-2 text-xs">
            入力フィールド、
            <br />
            微細な境界
          </p>
        </div>

        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Level 2</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card size-24 rounded-lg shadow-sm" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-sm</code>
          <p className="text-muted-foreground mt-2 text-xs">
            カード、
            <br />
            軽い浮き上がり
          </p>
        </div>

        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Level 3</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card size-24 rounded-lg shadow-md" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-md</code>
          <p className="text-muted-foreground mt-2 text-xs">
            ホバー状態、
            <br />
            アクティブカード
          </p>
        </div>

        <div className="text-center">
          <p className="mb-2 text-xs font-bold">Level 4</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card size-24 rounded-lg shadow-lg" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-lg</code>
          <p className="mt-2 text-xs font-bold">
            ドロップダウン、
            <br />
            ポップオーバー
          </p>
        </div>

        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Level 5</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card size-24 rounded-lg shadow-xl" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-xl</code>
          <p className="text-muted-foreground mt-2 text-xs">
            モーダル、
            <br />
            最前面要素
          </p>
        </div>
      </div>
    </div>
  ),
};

export const PhysicalLighting: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Physical Lighting System</h1>
      <p className="text-muted-foreground mb-8">
        光源を上に固定し、微細なグラデーション・ハイライト・2層シャドウで奥行きを表現。
        <br />
        <span className="text-xs">
          原則: ユーザーが気づかないこと。「なんかいい」は正解、「おしゃれ」は過剰。
        </span>
      </p>

      <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
        {/* Sunken */}
        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Sunken</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-input surface-sunken w-48 rounded-lg p-3">
              <span className="text-muted-foreground text-sm">入力フィールド</span>
            </div>
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">surface-sunken</code>
          <p className="text-muted-foreground mt-2 text-xs">
            input, textarea
            <br />
            凹み表現
          </p>
        </div>

        {/* Flat */}
        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Flat</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card surface-flat border-border size-24 rounded-lg border" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">surface-flat</code>
          <p className="text-muted-foreground mt-2 text-xs">
            Card, コンテンツ面
            <br />
            グラデーションのみ
          </p>
        </div>

        {/* Raised */}
        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Raised</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card surface-raised size-24 rounded-lg" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">surface-raised</code>
          <p className="text-muted-foreground mt-2 text-xs">
            dropdown, popover
            <br />
            ハイライト + 2層シャドウ
          </p>
        </div>

        {/* Raised Heavy */}
        <div className="text-center">
          <p className="text-muted-foreground mb-2 text-xs">Raised Heavy</p>
          <div className="flex h-28 items-center justify-center">
            <div className="bg-card surface-raised-heavy size-24 rounded-lg" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">surface-raised-heavy</code>
          <p className="text-muted-foreground mt-2 text-xs">
            dialog, sheet, inspector
            <br />
            最大の浮き
          </p>
        </div>
      </div>

      {/* 比較セクション */}
      <div className="mt-12">
        <h2 className="mb-4 font-bold">Before / After 比較</h2>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-muted-foreground mb-2 text-xs">Before（ベタ塗り + shadow-lg）</p>
            <div className="bg-card border-border w-full rounded-2xl border p-6 shadow-lg">
              <h3 className="mb-2 font-bold">カードタイトル</h3>
              <p className="text-muted-foreground text-sm">フラットな背景色 + ドロップシャドウ</p>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-2 text-xs">After（surface-raised-heavy）</p>
            <div className="bg-card surface-raised-heavy w-full rounded-2xl p-6">
              <h3 className="mb-2 font-bold">カードタイトル</h3>
              <p className="text-muted-foreground text-sm">
                グラデーション + ハイライト + 2層シャドウ
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const UseCases: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Surface Utilityの使い分け</h1>
      <p className="text-muted-foreground mb-8">
        UIの階層構造に応じてsurface-*を選択。高いほどユーザーの注目を集める。
      </p>

      <div className="space-y-8">
        <div>
          <h2 className="mb-4 font-bold">
            Sunken: 入力フィールド{' '}
            <code className="text-muted-foreground text-xs">surface-sunken</code>
          </h2>
          <div className="bg-input surface-sunken w-64 rounded-lg p-4">
            <span className="text-muted-foreground text-sm">テキストを入力...</span>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-bold">
            Flat: カード <code className="text-muted-foreground text-xs">surface-flat</code>
          </h2>
          <div className="bg-card surface-flat border-border w-64 rounded-lg border p-4">
            <p className="font-bold">カードタイトル</p>
            <p className="text-muted-foreground text-sm">コンテンツをグループ化</p>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-bold">
            Raised: ドロップダウン{' '}
            <code className="text-muted-foreground text-xs">surface-raised</code>
          </h2>
          <div className="bg-card surface-raised w-48 rounded-lg p-2">
            <div className="hover:bg-state-hover rounded px-4 py-2">メニュー1</div>
            <div className="hover:bg-state-hover rounded px-4 py-2">メニュー2</div>
            <div className="hover:bg-state-hover rounded px-4 py-2">メニュー3</div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-bold">
            Raised Heavy: モーダル{' '}
            <code className="text-muted-foreground text-xs">surface-raised-heavy</code>
          </h2>
          <div className="bg-card surface-raised-heavy w-80 rounded-2xl p-6">
            <h3 className="mb-2 text-lg font-bold">モーダルタイトル</h3>
            <p className="text-muted-foreground mb-4 text-sm">最前面でユーザーの操作を待つ</p>
            <div className="flex justify-end gap-2">
              <button className="hover:bg-state-hover rounded-lg px-4 py-2 text-sm">
                キャンセル
              </button>
              <button className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm">
                確認
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Glassmorphism: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Glassmorphism</h1>
      <p className="text-muted-foreground mb-8">
        半透明背景 + backdrop-blur による「ガラス」効果。3段階の透明度。
      </p>

      {/* 背景にグラデーションを配置してblur効果を見やすくする */}
      <div className="relative overflow-hidden rounded-2xl p-8" style={{ minHeight: 400 }}>
        {/* 装飾的な背景 */}
        <div className="from-primary/30 via-info/20 to-warning/10 absolute inset-0 bg-gradient-to-br" />
        <div className="bg-primary/40 absolute top-8 left-12 size-32 rounded-full blur-2xl" />
        <div className="bg-info/30 absolute right-16 bottom-12 size-40 rounded-full blur-2xl" />
        <div className="bg-warning/20 absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl" />

        {/* Glass パネル */}
        <div className="relative grid grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-foreground mb-4 text-sm font-bold">Light</p>
            <div className="glass-light rounded-xl p-6">
              <p className="text-foreground text-sm font-medium">glass-light</p>
              <p className="text-foreground/70 mt-1 text-xs">
                ほぼ不透明
                <br />
                ツールバー、ヘッダー
              </p>
            </div>
            <code className="bg-container mt-4 inline-block rounded px-2 py-1 text-xs">
              glass-light
            </code>
          </div>

          <div className="text-center">
            <p className="text-foreground mb-4 text-sm font-bold">Medium</p>
            <div className="glass-medium rounded-xl p-6">
              <p className="text-foreground text-sm font-medium">glass-medium</p>
              <p className="text-foreground/70 mt-1 text-xs">
                半透明
                <br />
                パネル、サイドバー
              </p>
            </div>
            <code className="bg-container mt-4 inline-block rounded px-2 py-1 text-xs">
              glass-medium
            </code>
          </div>

          <div className="text-center">
            <p className="text-foreground mb-4 text-sm font-bold">Heavy</p>
            <div className="glass-heavy rounded-xl p-6">
              <p className="text-foreground text-sm font-medium">glass-heavy</p>
              <p className="text-foreground/70 mt-1 text-xs">
                強い透過
                <br />
                オーバーレイ、装飾
              </p>
            </div>
            <code className="bg-container mt-4 inline-block rounded px-2 py-1 text-xs">
              glass-heavy
            </code>
          </div>
        </div>
      </div>

      {/* トークン一覧 */}
      <div className="mt-8">
        <h2 className="mb-4 font-bold">トークン一覧</h2>
        <div className="bg-card border-border rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-2 text-left font-medium">Utility</th>
                <th className="px-4 py-2 text-left font-medium">背景透明度</th>
                <th className="px-4 py-2 text-left font-medium">Blur</th>
                <th className="px-4 py-2 text-left font-medium">用途</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="px-4 py-2">
                  <code className="text-xs">glass-light</code>
                </td>
                <td className="text-muted-foreground px-4 py-2">60%</td>
                <td className="text-muted-foreground px-4 py-2">16px (md)</td>
                <td className="text-muted-foreground px-4 py-2">ツールバー、ヘッダー</td>
              </tr>
              <tr>
                <td className="px-4 py-2">
                  <code className="text-xs">glass-medium</code>
                </td>
                <td className="text-muted-foreground px-4 py-2">40%</td>
                <td className="text-muted-foreground px-4 py-2">16px (md)</td>
                <td className="text-muted-foreground px-4 py-2">パネル、サイドバー</td>
              </tr>
              <tr>
                <td className="px-4 py-2">
                  <code className="text-xs">glass-heavy</code>
                </td>
                <td className="text-muted-foreground px-4 py-2">20%</td>
                <td className="text-muted-foreground px-4 py-2">24px (lg)</td>
                <td className="text-muted-foreground px-4 py-2">オーバーレイ、装飾的背景</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* CSS変数 */}
      <div className="mt-8">
        <h2 className="mb-4 font-bold">Blur変数（カスタム併用時）</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          デフォルトのblurを変更したい場合は <code className="text-xs">backdrop-blur-*</code>{' '}
          を併用:
        </p>
        <div className="bg-container rounded-lg p-4">
          <code className="text-xs">
            --glass-blur-sm: 8px / --glass-blur-md: 16px / --glass-blur-lg: 24px
          </code>
        </div>
      </div>
    </div>
  ),
};
