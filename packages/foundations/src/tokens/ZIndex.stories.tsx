import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Shared/Foundations/ZIndex',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// z-index定義（tokens/z-index.css @theme と同期。
// 同期は scripts/__tests__/z-index-sync.test.ts が機械検証する —
// 手書き配列が CSS から 2 層ドリフトした前科への再発ロック）
const zIndexLayers = [
  {
    name: 'bottom-tab',
    value: 40,
    tailwind: 'z-bottom-tab',
    description: 'モバイル下部の固定バー（タグチップ列）',
  },
  {
    name: 'bottom-strip',
    value: 45,
    tailwind: 'z-bottom-strip',
    description: '下部バーの上に載る帯',
  },
  {
    name: 'dropdown',
    value: 50,
    tailwind: 'z-dropdown',
    description: 'ドロップダウンメニュー、セレクト',
  },
  {
    name: 'popover',
    value: 100,
    tailwind: 'z-popover',
    description: 'ポップオーバー（日付選択、カラーピッカー）',
  },
  {
    name: 'sheet',
    value: 150,
    tailwind: 'z-sheet',
    description: 'サイドシート、ドロワー（Inspector等）',
  },
  { name: 'modal', value: 200, tailwind: 'z-modal', description: '通常のダイアログ・モーダル' },
  {
    name: 'confirm',
    value: 250,
    tailwind: 'z-confirm',
    description: '確認ダイアログ（削除など重要な操作）',
  },
  { name: 'toast', value: 300, tailwind: 'z-toast', description: 'トースト通知' },
  {
    name: 'context-menu',
    value: 350,
    tailwind: 'z-context-menu',
    description: 'コンテキストメニュー（右クリック）',
  },
  {
    name: 'calendar-drag',
    value: 1000,
    tailwind: 'z-calendar-drag',
    description: 'カレンダードラッグプレビュー',
  },
  {
    name: 'inspector-backdrop',
    value: 1050,
    tailwind: 'z-inspector-backdrop',
    description: '現在未使用。将来フローティング化するUI向けの予約枠',
  },
  {
    name: 'inspector',
    value: 1100,
    tailwind: 'z-inspector',
    description: '現在未使用。将来フローティング化するUI向けの予約枠',
  },
  {
    name: 'overlay-modal',
    value: 1200,
    tailwind: 'z-overlay-modal',
    description: 'Inspector上のモーダル',
  },
  {
    name: 'overlay-popover',
    value: 1300,
    tailwind: 'z-overlay-popover',
    description: 'モーダル上のポップオーバー（Select・日付選択等）',
  },
  {
    name: 'overlay-confirm',
    value: 1400,
    tailwind: 'z-overlay-confirm',
    description: 'Inspector上の確認ダイアログ',
  },
  { name: 'tooltip', value: 9999, tailwind: 'z-tooltip', description: 'ツールチップ（最前面）' },
] as const;

// レイヤー行コンポーネント
function LayerRow({
  name,
  value,
  tailwind,
  description,
}: {
  name: string;
  value: number;
  tailwind: string;
  description: string;
}) {
  return (
    <div className="border-border flex items-center gap-4 border-b py-2">
      <div className="w-16 text-right">
        <span className="text-muted-foreground font-mono text-sm">{value}</span>
      </div>
      <div className="flex-1">
        <code className="bg-container rounded-lg px-2 py-1 text-sm font-medium">{tailwind}</code>
        <span className="text-muted-foreground ml-2 text-sm">{name}</span>
      </div>
      <div className="text-muted-foreground text-sm">{description}</div>
    </div>
  );
}

// ビジュアルスタック表示
function VisualStack() {
  const visualLayers = [
    { name: 'tooltip', color: 'bg-destructive', value: 9999 },
    { name: 'overlay-confirm', color: 'bg-warning', value: 1400 },
    { name: 'overlay-modal', color: 'bg-warning opacity-70', value: 1300 },
    { name: 'overlay-popover', color: 'bg-warning opacity-50', value: 1200 },
    { name: 'inspector', color: 'bg-info', value: 1100 },
    { name: 'calendar-drag', color: 'bg-success', value: 1000 },
    { name: 'context-menu', color: 'bg-primary opacity-80', value: 350 },
    { name: 'toast', color: 'bg-primary opacity-70', value: 300 },
    { name: 'confirm', color: 'bg-primary opacity-60', value: 250 },
    { name: 'modal', color: 'bg-primary opacity-50', value: 200 },
    { name: 'sheet', color: 'bg-primary opacity-40', value: 150 },
    { name: 'popover', color: 'bg-primary opacity-30', value: 100 },
    { name: 'dropdown', color: 'bg-primary opacity-20', value: 50 },
  ];

  return (
    <div className="relative h-[400px] w-full">
      {visualLayers.map((layer, index) => (
        <div
          key={layer.name}
          className={`${layer.color} border-border text-primary-foreground absolute flex items-center justify-center rounded-lg border text-sm font-medium`}
          style={{
            left: `${index * 20}px`,
            top: `${index * 30}px`,
            width: `calc(100% - ${index * 40}px)`,
            height: `calc(100% - ${index * 60}px)`,
            zIndex: layer.value,
          }}
        >
          <span className="bg-container rounded-lg px-2 py-1">
            {layer.name} ({layer.value})
          </span>
        </div>
      ))}
    </div>
  );
}

export const AllLayers: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">Z-Index レイヤー</h1>
      <p className="text-muted-foreground mb-8">
        UIコンポーネントのスタッキング順序を一元管理。値が大きいほど前面に表示される。
      </p>

      <div className="mb-12">
        <h2 className="mb-4 text-lg font-medium">使用方法</h2>
        <div className="bg-container rounded-lg p-4">
          <code className="text-sm">
            {`// Tailwindクラスとして使用`}
            <br />
            {`<div className="z-modal">...</div>`}
            <br />
            <br />
            {`// CSS変数として使用（非推奨）`}
            <br />
            {`style={{ zIndex: 'var(--z-index-modal)' }}`}
          </code>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="mb-4 text-lg font-medium">レイヤー一覧</h2>
        <div className="border-border rounded-lg border">
          <div className="bg-container border-border flex items-center gap-4 border-b px-4 py-2 text-sm font-medium">
            <div className="w-16 text-right">値</div>
            <div className="flex-1">Tailwindクラス</div>
            <div>用途</div>
          </div>
          <div className="px-4">
            {zIndexLayers.map((layer) => (
              <LayerRow key={layer.name} {...layer} />
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">ビジュアルスタック</h2>
        <p className="text-muted-foreground mb-4 text-sm">レイヤーの重なり順を視覚化</p>
        <div className="bg-container rounded-lg p-4">
          <VisualStack />
        </div>
      </div>
    </div>
  ),
};

export const UsageGuide: Story = {
  render: () => (
    <div>
      <h1 className="mb-8 text-2xl font-medium">Z-Index 使用ガイド</h1>

      <div className="space-y-8">
        <section>
          <h2 className="mb-4 text-lg font-medium">基本原則</h2>
          <ul className="text-muted-foreground list-disc space-y-2 pl-6">
            <li>
              <strong>Tailwindクラスを使用</strong>: <code>z-modal</code>, <code>z-tooltip</code>{' '}
              など
            </li>
            <li>
              {/* lint-tokens-allow: 禁止例の提示 */}
              <strong>任意値は避ける</strong>: <code>z-[200]</code> ではなく <code>z-modal</code>
            </li>
            <li>
              <strong>Inspector上のUIはoverlay系</strong>: Inspector上のモーダルは{' '}
              <code>z-overlay-modal</code>、日付選択は <code>z-overlay-popover</code>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium">レイヤーグループ</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-container rounded-lg p-4">
              <h3 className="mb-2 font-medium">通常コンテキスト（50-350）</h3>
              <p className="text-muted-foreground text-sm">
                ページ上の通常のオーバーレイ要素。dropdown, popover, sheet, modal, confirm, toast,
                context-menu
              </p>
            </div>
            <div className="bg-container rounded-lg p-4">
              <h3 className="mb-2 font-medium">Inspector（1000-1100）</h3>
              <p className="text-muted-foreground text-sm">
                ドラッグ操作やフローティングUI。calendar-drag, inspector-backdrop, inspector
              </p>
            </div>
            <div className="bg-container rounded-lg p-4">
              <h3 className="mb-2 font-medium">Overlay系（1200-1400）</h3>
              <p className="text-muted-foreground text-sm">
                Inspector上のUI。overlay-popover, overlay-modal, overlay-confirm
              </p>
            </div>
            <div className="bg-container rounded-lg p-4">
              <h3 className="mb-2 font-medium">最前面（9999）</h3>
              <p className="text-muted-foreground text-sm">常に最前面に表示される要素。tooltip</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium">Elevation との関係</h2>
          <div className="bg-container rounded-lg p-4">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Sunken / Base / Raised</span>
                <span className="text-muted-foreground ml-2">→ z-index 指定なし（通常フロー）</span>
              </p>
              <p>
                <span className="font-medium">Overlay</span>
                <span className="text-muted-foreground ml-2">→ このページの z-index を使用</span>
              </p>
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              見た目の浮き（shadow）は <strong>Elevation</strong> で、スタッキング順序は{' '}
              <strong>Z-Index</strong> で管理。別の関心事。
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium">よくあるパターン</h2>
          <div className="bg-container space-y-4 rounded-lg p-4">
            <div>
              <code className="text-sm font-medium">Inspector上のモーダル</code>
              <p className="text-muted-foreground text-sm">
                Inspector上で新規作成モーダルを開く → <code>z-overlay-modal</code>
              </p>
            </div>
            <div>
              <code className="text-sm font-medium">Inspector上のモーダル内の日付選択</code>
              <p className="text-muted-foreground text-sm">
                overlay-modal内のDatePickerは自動的に上に表示される（ポータル経由）
              </p>
            </div>
            <div>
              <code className="text-sm font-medium">Inspector上の確認ダイアログ</code>
              <p className="text-muted-foreground text-sm">
                Inspector上での削除確認 → <code>z-overlay-confirm</code>
              </p>
            </div>
            <div>
              <code className="text-sm font-medium">通常の確認ダイアログ</code>
              <p className="text-muted-foreground text-sm">
                ページ上の削除確認 → <code>z-confirm</code>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
};
