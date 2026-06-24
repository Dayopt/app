import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Shared/Foundations/Radius',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const AllRadius: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-medium">Border Radius（角丸）</h1>
      <p className="text-muted-foreground mb-8">
        4段階のみ。「modal/dialog だけ 16px、それ以外は 8px」が基本ルール。
      </p>

      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        <div className="text-center">
          <div className="bg-primary mx-auto mb-2 size-24 rounded-none" />
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-none</code>
          <p className="mt-2 text-xs font-medium">0px</p>
          <p className="text-muted-foreground mt-1 text-xs">
            タブのアクティブ状態、
            <br />
            隣接要素の結合部分
          </p>
        </div>

        <div className="text-center">
          <div className="bg-primary mx-auto mb-2 size-24 rounded-lg" />
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-lg</code>
          <p className="mt-2 text-xs font-medium">8px</p>
          <p className="text-muted-foreground mt-1 text-xs">
            <strong>標準</strong>: ボタン、
            <br />
            入力、メニュー、カード
          </p>
        </div>

        <div className="text-center">
          <div className="bg-primary mx-auto mb-2 size-24 rounded-2xl" />
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-2xl</code>
          <p className="mt-2 text-xs font-medium">16px</p>
          <p className="text-muted-foreground mt-1 text-xs">モーダル、ダイアログ</p>
        </div>

        <div className="text-center">
          <div className="bg-primary mx-auto mb-2 size-24 rounded-full" />
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-full</code>
          <p className="mt-2 text-xs font-medium">9999px</p>
          <p className="text-muted-foreground mt-1 text-xs">
            アバター、ピル型ボタン、
            <br />
            トグル、丸アイコン
          </p>
        </div>
      </div>
    </div>
  ),
};

export const UseCases: Story = {
  render: () => (
    <div>
      <h1 className="mb-8 text-2xl font-medium">使用例</h1>

      <div className="space-y-8">
        <div>
          <h2 className="mb-4 font-medium">ボタン</h2>
          <div className="flex gap-4">
            <button className="bg-primary text-primary-foreground rounded-lg px-4 py-2">
              rounded-lg（標準）
            </button>
            <button className="bg-primary text-primary-foreground rounded-full px-4 py-2">
              rounded-full（ピル型）
            </button>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-medium">カード・モーダル</h2>
          <div className="flex gap-4">
            <div className="bg-card text-card-foreground border-border w-48 rounded-lg border p-4">
              <p className="font-medium">rounded-lg</p>
              <p className="text-muted-foreground text-sm">カードの標準</p>
            </div>
            <div className="bg-card text-card-foreground border-border w-48 rounded-2xl border p-4">
              <p className="font-medium">rounded-2xl</p>
              <p className="text-muted-foreground text-sm">モーダル・ダイアログ</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-medium">アバター</h2>
          <div className="flex items-center gap-4">
            <div className="bg-primary size-12 rounded-lg" />
            <span className="text-muted-foreground text-sm">→</span>
            <div className="bg-primary size-12 rounded-full" />
          </div>
          <p className="text-muted-foreground mt-2 text-sm">アバターは rounded-full を推奨</p>
        </div>

        <div>
          <h2 className="mb-4 font-medium">入力フィールド</h2>
          <input
            type="text"
            placeholder="rounded-lg（標準）"
            className="bg-input text-foreground placeholder:text-muted-foreground border-border w-64 rounded-lg border px-4 py-2"
          />
        </div>

        <div>
          <h2 className="mb-4 font-medium">バッジ・タグ</h2>
          <div className="flex gap-2">
            <span className="border-primary text-primary rounded-lg border px-2 py-1 text-xs">
              rounded-lg
            </span>
            <span className="border-primary text-primary rounded-full border px-2 py-1 text-xs">
              rounded-full
            </span>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const ElevationMapping: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-medium">Elevation × Radius</h1>
      <p className="text-muted-foreground mb-8">
        modal/dialog だけ rounded-2xl (16px)、それ以外は rounded-lg (8px) で統一。
      </p>

      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        <div className="text-center">
          <div className="bg-container border-border mx-auto mb-2 flex h-24 w-36 items-center justify-center rounded-lg border p-4">
            <span className="text-muted-foreground text-sm">Sunken</span>
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-lg</code>
          <p className="text-muted-foreground mt-1 text-xs">sidebar, input</p>
        </div>

        <div className="text-center">
          <div className="bg-card border-border-subtle mx-auto mb-2 flex h-24 w-36 items-center justify-center rounded-lg border p-4 shadow-sm">
            <span className="text-muted-foreground text-sm">Raised</span>
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-lg</code>
          <p className="text-muted-foreground mt-1 text-xs">card, セクション</p>
        </div>

        <div className="text-center">
          <div className="bg-card border-border-subtle shadow-card mx-auto mb-2 flex h-24 w-36 items-center justify-center rounded-lg border p-4">
            <span className="text-muted-foreground text-sm">Overlay (小)</span>
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-lg</code>
          <p className="text-muted-foreground mt-1 text-xs">dropdown, popover</p>
        </div>

        <div className="text-center">
          <div className="bg-card border-border-subtle shadow-card mx-auto mb-2 flex h-24 w-36 items-center justify-center rounded-2xl border p-4">
            <span className="text-muted-foreground text-sm">Overlay (大)</span>
          </div>
          <code className="bg-container rounded-lg px-2 py-1 text-xs">rounded-2xl</code>
          <p className="text-muted-foreground mt-1 text-xs">modal, dialog</p>
        </div>
      </div>
    </div>
  ),
};

export const PartialRadius: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-medium">部分的なRadius</h1>
      <p className="text-muted-foreground mb-8">
        隣接要素の結合など、特定のコーナーのみ角丸にする場合に使用。
        <br />
        基本トークンと同じサイズ（8px, 16px）のみ許可。
      </p>

      <div className="space-y-8">
        <div>
          <h2 className="mb-4 font-medium">隣接要素の結合（Input Group）</h2>
          <div className="flex">
            <input
              type="text"
              placeholder="入力..."
              className="bg-input border-border w-48 rounded-l-lg border border-r-0 px-4 py-2"
            />
            <button className="bg-primary text-primary-foreground rounded-r-lg px-4 py-2">
              検索
            </button>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            <code className="bg-container rounded-lg px-1">rounded-l-lg</code> +{' '}
            <code className="bg-container rounded-lg px-1">rounded-r-lg</code>
          </p>
        </div>

        <div>
          <h2 className="mb-4 font-medium">範囲選択（カレンダー）</h2>
          <div className="flex">
            <div className="bg-primary-state-selected flex size-10 items-center justify-center rounded-l-lg text-sm">
              1
            </div>
            <div className="bg-primary-state-selected flex size-10 items-center justify-center text-sm">
              2
            </div>
            <div className="bg-primary-state-selected flex size-10 items-center justify-center rounded-r-lg text-sm">
              3
            </div>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            範囲の開始: <code className="bg-container rounded-lg px-1">rounded-l-lg</code>
            、終了: <code className="bg-container rounded-lg px-1">rounded-r-lg</code>
          </p>
        </div>

        <div>
          <h2 className="mb-4 font-medium">許可されている部分Radius</h2>
          <p className="text-muted-foreground mb-4 text-xs">
            基本トークンと同じサイズのみ: 8px, 16px
          </p>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="text-center">
              <div className="bg-primary mx-auto mb-2 size-16 rounded-l-lg" />
              <code className="bg-container rounded-lg px-1 text-xs">rounded-l-lg</code>
              <p className="text-muted-foreground text-xs">8px</p>
            </div>
            <div className="text-center">
              <div className="bg-primary mx-auto mb-2 size-16 rounded-r-lg" />
              <code className="bg-container rounded-lg px-1 text-xs">rounded-r-lg</code>
              <p className="text-muted-foreground text-xs">8px</p>
            </div>
            <div className="text-center">
              <div className="bg-primary mx-auto mb-2 size-16 rounded-t-lg" />
              <code className="bg-container rounded-lg px-1 text-xs">rounded-t-lg</code>
              <p className="text-muted-foreground text-xs">8px</p>
            </div>
            <div className="text-center">
              <div className="bg-primary mx-auto mb-2 size-16 rounded-b-lg" />
              <code className="bg-container rounded-lg px-1 text-xs">rounded-b-lg</code>
              <p className="text-muted-foreground text-xs">8px</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="text-center">
              <div className="bg-primary mx-auto mb-2 size-16 rounded-t-2xl" />
              <code className="bg-container rounded-lg px-1 text-xs">rounded-t-2xl</code>
              <p className="text-muted-foreground text-xs">16px</p>
            </div>
            <div className="text-center">
              <div className="bg-primary mx-auto mb-2 size-16 rounded-b-2xl" />
              <code className="bg-container rounded-lg px-1 text-xs">rounded-b-2xl</code>
              <p className="text-muted-foreground text-xs">16px</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};
