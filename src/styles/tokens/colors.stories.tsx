import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Foundations/Colors',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// Tailwindクラスからトークン名を抽出（bg-background → background）
function extractToken(tailwindClass: string): string {
  const match = tailwindClass.match(/^(?:bg|text|border|ring)-(.+)$/);
  return match?.[1] ?? tailwindClass;
}

// カラースウォッチコンポーネント
function ColorSwatch({
  tailwindClass,
  description,
}: {
  tailwindClass: string;
  description?: string;
}) {
  const token = extractToken(tailwindClass);
  return (
    <div className="flex items-center gap-4 py-2">
      <div
        className="border-border size-12 shrink-0 rounded-lg border"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <div className="min-w-0 flex-1">
        <code className="text-sm font-bold">{tailwindClass}</code>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
      </div>
    </div>
  );
}

// カラーグループコンポーネント
function ColorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="border-border mb-4 border-b pb-2 text-lg font-bold">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export const AllColors: Story = {
  render: () => (
    <div>
      <h1 className="mb-8 text-2xl font-bold">カラートークン</h1>

      <ColorGroup title="Surface（背景色・MD3準拠4段階）">
        <ColorSwatch tailwindClass="bg-background" description="ページ背景（MD3 Surface）" />
        <ColorSwatch
          tailwindClass="bg-surface-inset"
          description="card内セクション（MD3 Surface Container Low）"
        />
        <ColorSwatch
          tailwindClass="bg-container"
          description="サイドバー、セクション（MD3 Surface Container）"
        />
        <ColorSwatch
          tailwindClass="bg-card"
          description="カード、ダイアログ、ポップオーバー（MD3 Surface Container High）"
        />
        <ColorSwatch tailwindClass="bg-overlay" description="モーダル背景（半透明・MD3 scrim）" />
      </ColorGroup>

      <ColorGroup title="テキスト">
        <ColorSwatch tailwindClass="text-foreground" description="通常テキスト" />
        <ColorSwatch tailwindClass="text-muted-foreground" description="控えめなテキスト" />
        <ColorSwatch
          tailwindClass="text-card-foreground"
          description="shadcn/ui互換エイリアス（foregroundと同値）"
        />
      </ColorGroup>

      <ColorGroup title="Primary">
        <ColorSwatch tailwindClass="bg-primary" description="主要アクションの背景" />
        <ColorSwatch tailwindClass="text-primary-foreground" description="Primary上のテキスト" />
      </ColorGroup>

      <ColorGroup title="State（状態）">
        <ColorSwatch tailwindClass="bg-state-active" description="選択中・アクティブ状態" />
        <ColorSwatch
          tailwindClass="text-state-active-foreground"
          description="アクティブ状態のテキスト"
        />
      </ColorGroup>

      <ColorGroup title="Semantic（意味）">
        <ColorSwatch tailwindClass="bg-success" description="成功、完了" />
        <ColorSwatch tailwindClass="bg-warning" description="警告、注意" />
        <ColorSwatch tailwindClass="bg-info" description="情報" />
        <ColorSwatch tailwindClass="bg-destructive" description="削除、エラー" />
      </ColorGroup>

      <ColorGroup title="Chronotype（エネルギーフェーズ）">
        <ColorSwatch tailwindClass="bg-chronotype-warmup" description="ウォームアップ（起床後）" />
        <ColorSwatch tailwindClass="bg-chronotype-peak" description="ピーク（最集中）" />
        <ColorSwatch tailwindClass="bg-chronotype-dip" description="ディップ（エネルギー低下）" />
        <ColorSwatch tailwindClass="bg-chronotype-recovery" description="リカバリー（回復）" />
        <ColorSwatch
          tailwindClass="bg-chronotype-winddown"
          description="ウインドダウン（就寝準備）"
        />
      </ColorGroup>

      <ColorGroup title="Chronotype Tints（タイムライン背景用）">
        <ColorSwatch tailwindClass="bg-chronotype-tint-warmup" description="ウォームアップ tint" />
        <ColorSwatch
          tailwindClass="bg-chronotype-tint-peak"
          description="ピーク tint（alpha込み）"
        />
        <ColorSwatch tailwindClass="bg-chronotype-tint-dip" description="ディップ tint" />
        <ColorSwatch tailwindClass="bg-chronotype-tint-recovery" description="リカバリー tint" />
        <ColorSwatch
          tailwindClass="bg-chronotype-tint-winddown"
          description="ウインドダウン tint"
        />
      </ColorGroup>

      <ColorGroup title="Border & Input">
        <ColorSwatch
          tailwindClass="border-border"
          description="ボーダー（card上でも視認できるコントラスト比）"
        />
        <ColorSwatch tailwindClass="bg-input" description="入力フィールド背景" />
        <ColorSwatch tailwindClass="ring-ring" description="フォーカスリング" />
      </ColorGroup>

      <ColorGroup title="Chart（グラフ）">
        <ColorSwatch tailwindClass="bg-chart-1" />
        <ColorSwatch tailwindClass="bg-chart-2" />
        <ColorSwatch tailwindClass="bg-chart-3" />
        <ColorSwatch tailwindClass="bg-chart-4" />
        <ColorSwatch tailwindClass="bg-chart-5" />
      </ColorGroup>

      <ColorGroup title="Tag Colors（ダークモードで明度調整）">
        <ColorSwatch tailwindClass="bg-tag-blue" description="Blue（デフォルト）" />
        <ColorSwatch tailwindClass="bg-tag-green" description="Green" />
        <ColorSwatch tailwindClass="bg-tag-red" description="Red" />
        <ColorSwatch tailwindClass="bg-tag-amber" description="Amber" />
        <ColorSwatch tailwindClass="bg-tag-violet" description="Violet" />
        <ColorSwatch tailwindClass="bg-tag-pink" description="Pink" />
        <ColorSwatch tailwindClass="bg-tag-teal" description="Teal" />
        <ColorSwatch tailwindClass="bg-tag-orange" description="Orange" />
        <ColorSwatch tailwindClass="bg-tag-gray" description="Gray" />
        <ColorSwatch tailwindClass="bg-tag-indigo" description="Indigo" />
      </ColorGroup>

      <ColorGroup title="shadcn/ui互換エイリアス">
        <ColorSwatch
          tailwindClass="bg-secondary"
          description="= bg-container のエイリアス（shadcn/ui互換）"
        />
        <ColorSwatch
          tailwindClass="bg-muted"
          description="= bg-container のエイリアス（shadcn/ui互換）"
        />
        <ColorSwatch
          tailwindClass="bg-accent"
          description="= bg-state-active のエイリアス（shadcn/ui互換）"
        />
      </ColorGroup>
    </div>
  ),
};

export const Surface: Story = {
  render: () => (
    <div>
      <h2 className="mb-6 text-xl font-bold">Surface体系（GAFA準拠・3段階）</h2>
      <p className="text-muted-foreground mb-8">
        Material Design 3 / Apple HIG の共通原則に基づく意味ベース設計。
        <br />
        ダークモードでは高elevation = 明るい（MD3原則）。明度差は3-6%で視認性を確保。
      </p>

      <div className="space-y-4">
        <div className="bg-background border-border rounded-lg border p-6">
          <div className="font-bold">Background</div>
          <div className="text-muted-foreground text-sm">ページ背景（基準レベル）</div>
        </div>

        <div className="bg-container border-border rounded-lg border p-6">
          <div className="font-bold">Container</div>
          <div className="text-muted-foreground text-sm">
            サイドバー、セクション（backgroundより6%暗い）
          </div>
        </div>

        <div className="bg-card border-border rounded-lg border p-6">
          <div className="font-bold">Card</div>
          <div className="text-muted-foreground text-sm">
            カード、ダイアログ、ポップオーバー（containerより3%暗い = 最も沈んだレベル）
          </div>
        </div>

        <div className="bg-overlay border-border rounded-lg border p-6">
          <div className="text-foreground font-bold">Overlay</div>
          <div className="text-muted-foreground text-sm">
            モーダル背景（半透明・MD3 scrim）。Dialog/Sheetの後ろに敷く背景幕。
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Semantic: Story = {
  render: () => {
    const semanticColors = [
      {
        name: 'Destructive',
        bg: 'bg-destructive',
        text: 'text-destructive',
        fg: 'text-destructive-foreground',
        desc: '削除、エラー',
      },
      {
        name: 'Warning',
        bg: 'bg-warning',
        text: 'text-warning',
        fg: 'text-warning-foreground',
        desc: '警告、注意',
      },
      {
        name: 'Success',
        bg: 'bg-success',
        text: 'text-success',
        fg: 'text-success-foreground',
        desc: '成功、完了',
      },
      {
        name: 'Info',
        bg: 'bg-info',
        text: 'text-info',
        fg: 'text-info-foreground',
        desc: '情報、ヒント',
      },
    ] as const;

    return (
      <div>
        <h2 className="mb-2 text-xl font-bold">Semantic Colors（意味を持つ色）</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          WCAG 2.1 AA 準拠。全ペアが card 背景上で 4.5:1+ のコントラスト比を確保。
          ダークモードでは明度を上げ、foreground をダーク文字に反転。
        </p>

        {/* 背景スウォッチ */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {semanticColors.map(({ name, bg, fg, desc }) => (
            <div key={name} className="border-border rounded-lg border p-4 text-center">
              <div className={`${bg} mb-2 flex h-12 items-center justify-center rounded`}>
                <span className={`${fg} text-sm font-bold`}>Aa</span>
              </div>
              <div className="text-foreground font-bold">{name}</div>
              <div className="text-muted-foreground text-sm">{desc}</div>
            </div>
          ))}
        </div>

        {/* テキスト on Surface（コントラストチェック） */}
        <h3 className="mb-4 text-lg font-bold">text-* on Surface</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          badge outline 等で使われるパターン。card / background 上で 4.5:1+ を確保。
        </p>
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {semanticColors.map(({ name, text }) => (
            <div key={name} className="border-border flex gap-4 rounded-lg border p-4">
              <div className="bg-card flex flex-1 items-center justify-center rounded p-3">
                <span className={`${text} font-bold`}>{name} on card</span>
              </div>
              <div className="bg-background flex flex-1 items-center justify-center rounded p-3">
                <span className={`${text} font-bold`}>{name} on bg</span>
              </div>
            </div>
          ))}
        </div>

        {/* foreground 反転の説明 */}
        <div className="bg-card border-border rounded-lg border p-6">
          <h3 className="mb-2 font-bold">ダークモードの foreground 反転</h3>
          <p className="text-muted-foreground text-sm">
            ダークモードではセマンティックカラーの明度が上がるため、
            <code className="bg-container rounded px-1">text-*-foreground</code>{' '}
            が白→ダーク文字に自動反転。 コンポーネント側の変更は不要。
          </p>
        </div>
      </div>
    );
  },
};

export const Interaction: Story = {
  render: () => (
    <div>
      <h2 className="mb-6 text-xl font-bold">インタラクション状態</h2>
      <p className="text-muted-foreground mb-8">
        ホバー、フォーカス、プレス時の色変化。実際に操作して確認できます。
      </p>

      {/* State Layer一覧（MD3準拠） */}
      <div className="bg-card border-border mb-8 rounded-xl border p-6">
        <h3 className="mb-4 text-lg font-bold">State Layer一覧（MD3準拠）</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          foregroundベースの半透明オーバーレイ。ライト/ダークモードで自動調整される。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-3 text-left font-bold">状態</th>
                <th className="py-3 text-left font-bold">トークン</th>
                <th className="py-3 text-left font-bold">不透明度</th>
                <th className="py-3 text-left font-bold">用途</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-border border-b">
                <td className="py-3">Hover</td>
                <td className="py-3">
                  <code>bg-state-hover</code>
                </td>
                <td className="py-3">10%</td>
                <td className="py-3">マウスオーバー時</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3">Focus</td>
                <td className="py-3">
                  <code>bg-state-focus</code>
                </td>
                <td className="py-3">12%</td>
                <td className="py-3">キーボードフォーカス時</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3">Pressed</td>
                <td className="py-3">
                  <code>bg-state-pressed</code>
                </td>
                <td className="py-3">12%</td>
                <td className="py-3">クリック中</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3">Selected</td>
                <td className="py-3">
                  <code>bg-state-selected</code>
                </td>
                <td className="py-3">12%</td>
                <td className="py-3">選択状態</td>
              </tr>
              <tr className="border-border border-b">
                <td className="py-3">Dragged</td>
                <td className="py-3">
                  <code>bg-state-dragged</code>
                </td>
                <td className="py-3">16%</td>
                <td className="py-3">ドラッグ中</td>
              </tr>
              <tr>
                <td className="py-3">Active</td>
                <td className="py-3">
                  <code>bg-state-active</code>
                </td>
                <td className="py-3">塗り</td>
                <td className="py-3">選択中（塗りつぶし）</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 汎用ホバー（Ghost/Outline用） */}
      <div className="mb-8">
        <h3 className="border-border mb-4 border-b pb-2 text-lg font-bold">
          汎用ホバー（Ghost/Outline用）
        </h3>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            className="hover:bg-state-hover rounded-lg border border-transparent px-4 py-2 transition-colors"
          >
            <code className="text-sm">hover:bg-state-hover</code>
          </button>
          <button
            type="button"
            className="border-border hover:bg-state-hover rounded-lg border px-4 py-2 transition-colors"
          >
            <code className="text-sm">Outline + hover</code>
          </button>
        </div>
      </div>

      {/* 塗りボタン用ホバー */}
      <div className="mb-8">
        <h3 className="border-border mb-4 border-b pb-2 text-lg font-bold">塗りボタン用ホバー</h3>
        <div className="flex flex-wrap gap-4">
          {[
            { bg: 'bg-primary', hover: 'hover:bg-primary-hover', label: 'primary' },
            { bg: 'bg-destructive', hover: 'hover:bg-destructive-hover', label: 'destructive' },
            { bg: 'bg-secondary', hover: 'hover:bg-secondary-hover', label: 'secondary' },
            { bg: 'bg-warning', hover: 'hover:bg-warning-hover', label: 'warning' },
            { bg: 'bg-success', hover: 'hover:bg-success-hover', label: 'success' },
            { bg: 'bg-info', hover: 'hover:bg-info-hover', label: 'info' },
          ].map(({ bg, hover, label }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <button
                type="button"
                className={`${bg} ${hover} h-12 w-24 rounded-lg transition-colors`}
                aria-label={`${label} hover demo`}
              />
              <code className="text-muted-foreground text-xs">{label}</code>
            </div>
          ))}
        </div>
      </div>

      {/* セマンティックGhostホバー */}
      <div className="mb-8">
        <h3 className="border-border mb-4 border-b pb-2 text-lg font-bold">
          セマンティックGhostホバー
        </h3>
        <p className="text-muted-foreground mb-4 text-sm">
          色付きのGhost/Outlineボタン用（MD3 state layer方式）
        </p>
        <div className="flex flex-wrap gap-4">
          {[
            {
              text: 'text-primary',
              hover: 'hover:bg-primary-state-hover',
              label: 'primary',
            },
            {
              text: 'text-destructive',
              hover: 'hover:bg-destructive-state-hover',
              label: 'destructive',
            },
          ].map(({ text, hover, label }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <button
                type="button"
                className={`${text} ${hover} border-border h-12 w-24 rounded-lg border transition-colors`}
                aria-label={`${label} ghost hover demo`}
              />
              <code className="text-muted-foreground text-xs">{label}</code>
            </div>
          ))}
        </div>
      </div>

      {/* フォーカスリング */}
      <div className="mb-8">
        <h3 className="border-border mb-4 border-b pb-2 text-lg font-bold">
          フォーカスリング（MD3スタイル）
        </h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Tabキーでフォーカスを移動して確認。ボーダーがリングに置き換わる。
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            className="border-border focus-visible:ring-ring rounded-lg border px-4 py-2 outline-none focus-visible:border-transparent focus-visible:ring-2"
          >
            <code className="text-sm">focus-visible:border-transparent + ring</code>
          </button>
          <input
            type="text"
            placeholder="入力フィールド"
            className="border-border bg-input focus-visible:ring-ring rounded-lg border px-4 py-2 outline-none focus-visible:border-transparent focus-visible:ring-2"
          />
        </div>
      </div>

      {/* アクティブ/選択状態 */}
      <div className="mb-8">
        <h3 className="border-border mb-4 border-b pb-2 text-lg font-bold">アクティブ/選択状態</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="bg-state-active h-12 w-24 rounded-lg" />
            <code className="text-muted-foreground text-xs">bg-state-active</code>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className="active:bg-state-hover border-border h-12 w-24 rounded-lg border transition-colors"
              aria-label="active state demo"
            />
            <code className="text-muted-foreground text-xs">active:bg-state-hover</code>
          </div>
        </div>
      </div>

      {/* リンク/テキストホバー */}
      <div className="mb-8">
        <h3 className="border-border mb-4 border-b pb-2 text-lg font-bold">
          リンク/テキストホバー
        </h3>
        <p className="text-muted-foreground mb-4 text-sm">
          テキストリンクのホバースタイル。下線の濃さが変化。
        </p>
        <div className="flex flex-wrap items-center gap-6">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-primary decoration-primary/30 hover:decoration-primary underline transition-colors"
          >
            下線リンク（hover:decoration-primary）
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-primary transition-colors hover:underline"
          >
            ホバーで下線（hover:underline）
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            色変化（hover:text-foreground）
          </a>
        </div>
      </div>

      {/* 使用例 */}
      <div className="bg-card border-border rounded-lg border p-6">
        <h3 className="mb-4 font-bold">コピペ用クラス</h3>
        <div className="space-y-4 font-mono text-sm">
          <div className="text-muted-foreground mb-2 text-xs">汎用</div>
          <div>
            <span className="text-muted-foreground">Ghost:</span> <code>hover:bg-state-hover</code>
          </div>
          <div>
            <span className="text-muted-foreground">Focus:</span>{' '}
            <code>
              focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring
            </code>
          </div>
          <div>
            <span className="text-muted-foreground">Selected:</span>{' '}
            <code>bg-state-active text-state-active-foreground</code>
          </div>

          <div className="text-muted-foreground mt-4 mb-2 text-xs">塗りボタン</div>
          <div>
            <span className="text-muted-foreground">Primary:</span>{' '}
            <code>bg-primary hover:bg-primary-hover</code>
          </div>
          <div>
            <span className="text-muted-foreground">Destructive:</span>{' '}
            <code>bg-destructive hover:bg-destructive-hover</code>
          </div>
          <div>
            <span className="text-muted-foreground">Secondary:</span>{' '}
            <code>bg-secondary hover:bg-secondary-hover</code>
          </div>
          <div>
            <span className="text-muted-foreground">Warning:</span>{' '}
            <code>bg-warning hover:bg-warning-hover</code>
          </div>
          <div>
            <span className="text-muted-foreground">Success:</span>{' '}
            <code>bg-success hover:bg-success-hover</code>
          </div>
          <div>
            <span className="text-muted-foreground">Info:</span>{' '}
            <code>bg-info hover:bg-info-hover</code>
          </div>

          <div className="text-muted-foreground mt-4 mb-2 text-xs">セマンティックGhost</div>
          <div>
            <span className="text-muted-foreground">Primary Ghost:</span>{' '}
            <code>text-primary hover:bg-primary-state-hover</code>
          </div>
          <div>
            <span className="text-muted-foreground">Destructive Ghost:</span>{' '}
            <code>text-destructive hover:bg-destructive-state-hover</code>
          </div>

          <div className="text-muted-foreground mt-4 mb-2 text-xs">リンク</div>
          <div>
            <span className="text-muted-foreground">下線リンク:</span>{' '}
            <code>text-primary underline decoration-primary/30 hover:decoration-primary</code>
          </div>
          <div>
            <span className="text-muted-foreground">ホバー下線:</span>{' '}
            <code>text-primary hover:underline</code>
          </div>
          <div>
            <span className="text-muted-foreground">色変化:</span>{' '}
            <code>text-muted-foreground hover:text-foreground</code>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Text: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">テキストカラー</h1>
      <p className="text-muted-foreground mb-8">色で情報の重要度を表現。</p>

      <div className="space-y-4">
        {[
          {
            token: 'text-foreground',
            cls: 'text-foreground',
            label: '主要テキスト（見出し、本文）',
          },
          {
            token: 'text-muted-foreground',
            cls: 'text-muted-foreground',
            label: '補助テキスト（説明、キャプション）',
          },
          { token: 'text-primary', cls: 'text-primary', label: 'リンク、アクション' },
          { token: 'text-destructive', cls: 'text-destructive', label: 'エラー、警告' },
          { token: 'text-success', cls: 'text-success', label: '成功、完了' },
        ].map(({ token, cls, label }) => (
          <div key={token} className="border-border flex items-center gap-4 border-b pb-4">
            <div className={`${cls} h-6 w-6 shrink-0 rounded-full bg-current`} />
            <div>
              <code className="text-foreground text-xs">{token}</code>
              <p className="text-muted-foreground text-sm">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const Tags: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">タグカラー</h1>
      <p className="text-muted-foreground mb-8">
        ユーザーがタグに設定できる10色のパレット。
        <br />
        ダークモードでは明度を上げ、彩度を下げてアクセシビリティを確保。
      </p>

      <div className="space-y-4">
        {[
          { token: 'tag-blue', name: 'Blue', description: 'デフォルト' },
          { token: 'tag-green', name: 'Green', description: '' },
          { token: 'tag-red', name: 'Red', description: '' },
          { token: 'tag-amber', name: 'Amber', description: '' },
          { token: 'tag-violet', name: 'Violet', description: '' },
          { token: 'tag-pink', name: 'Pink', description: '' },
          { token: 'tag-teal', name: 'Teal', description: '' },
          { token: 'tag-orange', name: 'Orange', description: '' },
          { token: 'tag-gray', name: 'Gray', description: 'グループのデフォルト' },
          { token: 'tag-indigo', name: 'Indigo', description: '' },
        ].map(({ token, name, description }) => (
          <div key={token} className="border-border flex items-center gap-4 border-b pb-4">
            <div
              className="size-10 shrink-0 rounded-lg"
              style={{ backgroundColor: `var(--${token})` }}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <code className="bg-container rounded px-2 py-1 text-xs">bg-{token}</code>
                <span className="font-bold">{name}</span>
              </div>
              {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
            </div>
          </div>
        ))}
      </div>

      <h2 className="border-border mt-8 mb-4 border-b pb-2 text-lg font-bold">
        Tag Tint（EntryCard背景色）
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        EntryCardの背景に使用される薄いティント。ダークモードではL=0.28 C=0.06で色味を維持。
      </p>
      <div className="space-y-4">
        {[
          { token: 'tag-blue-tint', name: 'Blue Tint' },
          { token: 'tag-green-tint', name: 'Green Tint' },
          { token: 'tag-red-tint', name: 'Red Tint' },
          { token: 'tag-amber-tint', name: 'Amber Tint' },
          { token: 'tag-violet-tint', name: 'Violet Tint' },
          { token: 'tag-pink-tint', name: 'Pink Tint' },
          { token: 'tag-teal-tint', name: 'Teal Tint' },
          { token: 'tag-orange-tint', name: 'Orange Tint' },
          { token: 'tag-gray-tint', name: 'Gray Tint' },
          { token: 'tag-indigo-tint', name: 'Indigo Tint' },
        ].map(({ token, name }) => (
          <div key={token} className="border-border flex items-center gap-4 border-b pb-4">
            <div
              className="border-border size-10 shrink-0 rounded-lg border"
              style={{ backgroundColor: `var(--${token})` }}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <code className="bg-container rounded px-2 py-1 text-xs">{token}</code>
                <span className="font-bold">{name}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border-border mt-8 rounded-lg border p-6">
        <h2 className="mb-4 font-bold">使用例</h2>
        <div className="flex flex-wrap gap-2">
          <span className="border-tag-blue rounded-full border px-3 py-1 text-sm">タグ例</span>
          <span className="border-tag-green rounded-full border px-3 py-1 text-sm">タグ例</span>
          <span className="border-tag-red rounded-full border px-3 py-1 text-sm">タグ例</span>
          <span className="border-tag-amber rounded-full border px-3 py-1 text-sm">タグ例</span>
          <span className="border-tag-violet rounded-full border px-3 py-1 text-sm">タグ例</span>
        </div>
        <p className="text-muted-foreground mt-4 text-sm">
          タグバッジでは <code>border-tag-*</code> でボーダー色を設定
        </p>
      </div>
    </div>
  ),
};

export const Chronotype: Story = {
  render: () => {
    const CHROMA_STEPS = [
      { c: 0.01, label: 'tint', usage: 'タイムライン背景' },
      { c: 0.04, label: 'hover', usage: 'ホバー状態' },
      { c: 0.08, label: 'base', usage: 'ベース色' },
      { c: 0.12, label: 'accent', usage: 'アクセント' },
      { c: 0.18, label: 'strong', usage: 'テキスト on bg' },
    ] as const;

    const PHASES = [
      { name: 'Warmup', key: 'warmup', hue: 165, l: 0.7, desc: 'ダスティエメラルド' },
      { name: 'Peak', key: 'peak', hue: 110, l: 0.68, desc: 'セージライム' },
      { name: 'Dip', key: 'dip', hue: 260, l: 0.68, desc: 'ダスティペリウィンクル' },
      { name: 'Recovery', key: 'recovery', hue: 213, l: 0.7, desc: 'ミューテッドアジュール' },
      { name: 'Wind-down', key: 'winddown', hue: 330, l: 0.7, desc: 'ダスティローズ' },
    ] as const;

    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">Chronotype カラー</h1>
        <p className="text-muted-foreground mb-8">
          OKLCH の C（彩度）軸だけを変えることで、同一色相の濃淡バリエーションを作成。
          <br />H と L を固定し、C のスライダーを動かすだけで tint から strong
          まで一貫性のあるスケールが得られる。
        </p>

        <div className="space-y-8">
          {PHASES.map((phase) => (
            <div key={phase.key}>
              <h2 className="mb-3 text-lg font-bold">
                {phase.name}{' '}
                <span className="text-muted-foreground text-sm font-normal">
                  H={phase.hue} L={phase.l}（{phase.desc}）
                </span>
              </h2>
              <div className="flex gap-4">
                {CHROMA_STEPS.map((step) => (
                  <div key={step.c} className="text-center">
                    <div
                      className="border-border mb-2 size-20 rounded-lg border"
                      style={{
                        backgroundColor: `oklch(${phase.l} ${step.c} ${phase.hue})`,
                      }}
                    />
                    <p className="text-sm font-medium">C {step.c}</p>
                    <p className="text-muted-foreground text-xs">{step.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

export const DosDonts: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Do&apos;s & Don&apos;ts</h1>
      <p className="text-muted-foreground mb-8">カラー使用のベストプラクティス。</p>

      <div className="grid max-w-5xl gap-8">
        {/* セマンティックトークン */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-4 text-lg font-bold">セマンティックトークンを使用</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-3 border-l-4 pl-4">
              <p className="text-success font-bold">Do</p>
              <div className="flex gap-2">
                <div className="bg-destructive h-8 w-16 rounded" />
                <div className="bg-success h-8 w-16 rounded" />
              </div>
              <code className="text-muted-foreground block text-xs">
                className=&quot;bg-destructive text-destructive-foreground&quot;
              </code>
            </div>
            <div className="border-destructive space-y-3 border-l-4 pl-4">
              <p className="text-destructive font-bold">Don&apos;t</p>
              <code className="text-muted-foreground block text-xs">
                className=&quot;bg-red-500 text-white&quot;
                <br />
                className=&quot;bg-green-500 text-white&quot;
              </code>
              <p className="text-muted-foreground text-xs">
                直接カラー指定はダークモードで破綻する
              </p>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由:
            セマンティックトークンはダークモード対応を自動化し、デザイン変更時の一括修正を可能にする。
          </p>
        </section>

        {/* テキストコントラスト */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-4 text-lg font-bold">適切なテキストコントラスト</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-3 border-l-4 pl-4">
              <p className="text-success font-bold">Do</p>
              <div className="bg-primary h-8 rounded" />
              <code className="text-muted-foreground block text-xs">
                text-primary-foreground on bg-primary
              </code>
              <div className="bg-container text-foreground rounded p-2 text-sm">
                text-foreground on bg-container
              </div>
            </div>
            <div className="border-destructive space-y-3 border-l-4 pl-4">
              <p className="text-destructive font-bold">Don&apos;t</p>
              <code className="text-muted-foreground block text-xs">
                text-muted-foreground on bg-primary
                <br />
                opacity-50 text
              </code>
              <p className="text-muted-foreground text-xs">
                コントラスト比4.5:1未満になる組み合わせは避ける
              </p>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由: WCAG 2.1 AA基準（コントラスト比4.5:1以上）を満たすため。
          </p>
        </section>

        {/* Surface階層 */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-4 text-lg font-bold">Surface階層を守る</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-3 border-l-4 pl-4">
              <p className="text-success font-bold">Do</p>
              <div className="bg-background rounded-lg p-2">
                <div className="bg-container rounded p-2">
                  <div className="bg-card rounded p-2 text-sm">background → container → card</div>
                </div>
              </div>
            </div>
            <div className="border-destructive space-y-3 border-l-4 pl-4">
              <p className="text-destructive font-bold">Don&apos;t</p>
              <code className="text-muted-foreground block text-xs">
                card → background → container
              </code>
              <p className="text-muted-foreground text-xs">親→子で暗くなる階層を逆転させない</p>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由: MD3原則に基づく視覚的階層。親→子で暗くなる一貫した構造。
          </p>
        </section>

        {/* 状態色 */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-4 text-lg font-bold">状態を色で表現</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-3 border-l-4 pl-4">
              <p className="text-success font-bold">Do</p>
              <ul className="text-muted-foreground space-y-2 text-sm">
                {[
                  { label: '成功', cls: 'bg-success' },
                  { label: 'エラー', cls: 'bg-destructive' },
                  { label: '警告', cls: 'bg-warning' },
                  { label: '情報', cls: 'bg-info' },
                ].map(({ label, cls }) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className={`${cls} inline-block h-4 w-4 shrink-0 rounded-full`} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-destructive space-y-3 border-l-4 pl-4">
              <p className="text-destructive font-bold">Don&apos;t</p>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>成功を青で表示</li>
                <li>エラーを黄色で表示</li>
                <li>色だけで状態を伝える（アイコンなし）</li>
              </ul>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由: 色の意味を統一することでユーザーの認知負荷を軽減。
          </p>
        </section>
      </div>
    </div>
  ),
};
