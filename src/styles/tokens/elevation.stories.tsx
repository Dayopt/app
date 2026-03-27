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
            <div className="bg-input w-48 rounded-lg p-3 shadow-inner">
              <span className="text-muted-foreground text-sm">入力フィールド</span>
            </div>
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-inner</code>
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
            <div className="bg-card border-border size-24 rounded-lg border" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs"></code>
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
            <div className="bg-card size-24 rounded-lg shadow-md" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-md</code>
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
            <div className="bg-card size-24 rounded-lg shadow-lg" />
          </div>
          <code className="bg-container rounded px-2 py-1 text-xs">shadow-lg</code>
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
            <p className="text-muted-foreground mb-2 text-xs">After（shadow-lg）</p>
            <div className="bg-card w-full rounded-2xl p-6 shadow-lg">
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
            <code className="text-muted-foreground text-xs">shadow-inner</code>
          </h2>
          <div className="bg-input w-64 rounded-lg p-4 shadow-inner">
            <span className="text-muted-foreground text-sm">テキストを入力...</span>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-bold">
            Flat: カード <code className="text-muted-foreground text-xs"></code>
          </h2>
          <div className="bg-card border-border w-64 rounded-lg border p-4">
            <p className="font-bold">カードタイトル</p>
            <p className="text-muted-foreground text-sm">コンテンツをグループ化</p>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-bold">
            Raised: ドロップダウン <code className="text-muted-foreground text-xs">shadow-md</code>
          </h2>
          <div className="bg-card w-48 rounded-lg p-2 shadow-md">
            <div className="hover:bg-state-hover rounded px-4 py-2">メニュー1</div>
            <div className="hover:bg-state-hover rounded px-4 py-2">メニュー2</div>
            <div className="hover:bg-state-hover rounded px-4 py-2">メニュー3</div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-bold">
            Raised Heavy: モーダル <code className="text-muted-foreground text-xs">shadow-lg</code>
          </h2>
          <div className="bg-card w-80 rounded-2xl p-6 shadow-lg">
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

/* ============================================
 * Surface × Backdrop Filter 比較
 * ============================================ */

const SURFACES = [
  { name: 'background', bg: 'bg-background', desc: 'ページ背景' },
  { name: 'muted', bg: 'bg-muted', desc: '入力欄、well' },
  { name: 'container', bg: 'bg-container', desc: 'サイドバー、セクション' },
  { name: 'card', bg: 'bg-card', desc: 'カード、ダイアログ' },
] as const;

const FILTERS = [
  { name: 'なし（現状）', classes: '' },
  { name: 'backdrop-blur-sm', classes: 'backdrop-blur-sm' },
  { name: 'backdrop-blur-md', classes: 'backdrop-blur-md' },
  { name: 'backdrop-brightness-90', classes: 'backdrop-brightness-90' },
  { name: 'backdrop-brightness-75', classes: 'backdrop-brightness-75' },
  { name: 'backdrop-saturate-150', classes: 'backdrop-saturate-150' },
  { name: 'backdrop-saturate-200', classes: 'backdrop-saturate-200' },
  { name: 'blur + brightness-90', classes: 'backdrop-blur-sm backdrop-brightness-90' },
  { name: 'blur + saturate-150', classes: 'backdrop-blur-sm backdrop-saturate-150' },
  {
    name: 'blur + brightness + saturate',
    classes: 'backdrop-blur-sm backdrop-brightness-90 backdrop-saturate-150',
  },
] as const;

function ColorfulBackground() {
  return (
    <>
      <div className="from-primary/30 via-info/20 to-warning/10 absolute inset-0 bg-gradient-to-br" />
      <div className="bg-primary/40 absolute top-4 left-8 size-24 rounded-full blur-2xl" />
      <div className="bg-info/30 absolute right-8 bottom-4 size-32 rounded-full blur-2xl" />
      <div className="bg-warning/20 absolute top-1/2 left-1/3 size-20 rounded-full blur-xl" />
      <div className="bg-destructive/15 absolute top-1/4 right-1/4 size-16 rounded-full blur-xl" />
    </>
  );
}

export const BackdropFilterComparison: Story = {
  render: () => (
    <div className="space-y-12">
      <div>
        <h1 className="mb-2 text-2xl font-bold">Surface × Backdrop Filter</h1>
        <p className="text-muted-foreground mb-8">
          各surface背景に backdrop-blur / backdrop-brightness / backdrop-saturate を適用した比較。
          <br />
          <span className="text-xs">
            背景を半透明（/80）にしてフィルター効果を可視化しています。
          </span>
        </p>
      </div>

      {SURFACES.map((surface) => (
        <div key={surface.name}>
          <h2 className="mb-1 text-lg font-bold">{surface.name}</h2>
          <p className="text-muted-foreground mb-4 text-xs">{surface.desc}</p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {FILTERS.map((filter) => (
              <div key={filter.name} className="text-center">
                <div className="relative overflow-hidden rounded-xl" style={{ minHeight: 120 }}>
                  <ColorfulBackground />
                  <div
                    className={`relative flex h-full min-h-[120px] items-center justify-center rounded-xl p-4 ${surface.bg}/80 ${filter.classes}`}
                  >
                    <span className="text-foreground text-sm font-medium">Aa テキスト</span>
                  </div>
                </div>
                <code className="mt-2 inline-block text-xs leading-tight">{filter.name}</code>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <h2 className="mb-4 text-lg font-bold">不透明 vs 半透明 + Filter</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          左: 現状（不透明 bg-card）、右: 半透明 + backdrop-filter の比較
        </p>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-bold">現状: bg-card（不透明）</p>
            <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: 200 }}>
              <ColorfulBackground />
              <div className="bg-card relative rounded-2xl p-6 shadow-md">
                <h3 className="mb-2 font-bold">カードタイトル</h3>
                <p className="text-muted-foreground text-sm">背景は完全に隠れる</p>
                <div className="mt-4 flex gap-2">
                  <div className="bg-primary/10 h-8 flex-1 rounded" />
                  <div className="bg-primary/10 h-8 flex-1 rounded" />
                </div>
              </div>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-bold">
              提案: bg-card/80 + backdrop-blur-sm + backdrop-saturate-150
            </p>
            <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: 200 }}>
              <ColorfulBackground />
              <div className="bg-card/80 relative rounded-2xl p-6 shadow-md backdrop-blur-sm backdrop-saturate-150">
                <h3 className="mb-2 font-bold">カードタイトル</h3>
                <p className="text-muted-foreground text-sm">背景がぼんやり透ける</p>
                <div className="mt-4 flex gap-2">
                  <div className="bg-primary/10 h-8 flex-1 rounded" />
                  <div className="bg-primary/10 h-8 flex-1 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};
