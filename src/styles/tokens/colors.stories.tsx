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
  oklch,
}: {
  tailwindClass: string;
  description?: string;
  /** "light | dark" 形式の oklch 値 */
  oklch?: string;
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
        {oklch && <p className="mt-0.5 font-mono text-xs opacity-40">{oklch}</p>}
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
      <h1 className="mb-4 text-2xl font-bold">カラートークン</h1>

      {/* ── 設計原則 ── */}
      <div className="bg-card border-border mb-10 rounded-xl border p-6">
        <h2 className="mb-3 text-lg font-bold">設計原則</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          oklch(L C H) の3軸がそれぞれ1つの役割を持つ。
        </p>
        <div className="mb-4 space-y-1 font-mono text-sm">
          <div>
            <span className="text-muted-foreground">L軸</span> = 空間（浮く/沈む）
          </div>
          <div>
            <span className="text-muted-foreground">H軸</span> = 意味（blue=info, amber=warning,
            green=success, red=destructive）
          </div>
          <div>
            <span className="text-muted-foreground">C軸</span> = 強度（tint=薄い, accent=強い）
          </div>
        </div>
        <div className="text-muted-foreground space-y-1 text-xs">
          <p>
            <span className="text-foreground font-bold">判断フロー:</span> 1. この面はどこ？→
            Surface（4択） 2. 色で意味を伝える？→ No なら neutral で終了 3. どの強さ？→ tint /
            accent
          </p>
          <p>
            <span className="text-foreground font-bold">Dark:</span> Surface — warm H60 C0.008。
            テキストはオフホワイト L0.90（純白にしない）。Border — alpha-based（black/α, white/α）
          </p>
        </div>
      </div>

      {/* ━━ 1. Neutral ━━ */}
      <h2 className="text-muted-foreground mb-6 text-xs font-bold tracking-widest uppercase">
        1. Neutral — 9割のUIはここで完結
      </h2>

      <ColorGroup title="Surface">
        <ColorSwatch
          tailwindClass="bg-container"
          description="沈む: sidebar, footer"
          oklch="oklch(0.96 0 0) | oklch(0.15 0.008 60)"
        />
        <ColorSwatch
          tailwindClass="bg-background"
          description="基準: page"
          oklch="oklch(0.98 0 0) | oklch(0.18 0.008 60)"
        />
        <ColorSwatch
          tailwindClass="bg-card"
          description="浮く: card, dialog"
          oklch="oklch(1.00 0 0) | oklch(0.22 0.008 60)"
        />
        <ColorSwatch
          tailwindClass="bg-muted"
          description="窪み: input, well"
          oklch="oklch(0.95 0 0) | oklch(0.25 0.008 60)"
        />
        <ColorSwatch
          tailwindClass="bg-overlay"
          description="scrim: modal背景"
          oklch="oklch(0 0 0 / 0.32) | oklch(0 0 0 / 0.50)"
        />
      </ColorGroup>

      <ColorGroup title="Text">
        <ColorSwatch
          tailwindClass="text-foreground"
          description="主要"
          oklch="oklch(0.13 0 0) | oklch(0.90 0.005 70)"
        />
        <ColorSwatch
          tailwindClass="text-muted-foreground"
          description="補助"
          oklch="oklch(0.40 0 0) | oklch(0.68 0.005 60)"
        />
      </ColorGroup>

      <ColorGroup title="Border">
        <ColorSwatch
          tailwindClass="border-border"
          description="card外枠、セクション区切り"
          oklch="oklch(0 0 0 / 0.06) | oklch(1 0 0 / 0.07)"
        />
        <ColorSwatch
          tailwindClass="border-border-subtle"
          description="card内部の区切り"
          oklch="oklch(0 0 0 / 0.04) | oklch(1 0 0 / 0.05)"
        />
      </ColorGroup>

      {/* ━━ 2. Semantic ━━ */}
      <h2 className="text-muted-foreground mt-10 mb-6 text-xs font-bold tracking-widest uppercase">
        2. Semantic — 意味があるときだけ
      </h2>
      <p className="text-muted-foreground -mt-4 mb-6 text-xs">
        destructive/warning/success は同じ L/C 構造で H だけ変化。info は neutral（低彩度）。
      </p>

      <ColorGroup title="Destructive (H25)">
        <ColorSwatch
          tailwindClass="bg-destructive-tint"
          description="tint"
          oklch="oklch(0.96 0.015 25) | oklch(0.22 0.03 25)"
        />
        <ColorSwatch
          tailwindClass="bg-destructive"
          description="accent"
          oklch="oklch(0.58 0.16 25) | oklch(0.62 0.14 25)"
        />
        <ColorSwatch
          tailwindClass="text-destructive-foreground"
          description="accent面上の文字"
          oklch="oklch(1 0 0) | oklch(0.15 0 0)"
        />
      </ColorGroup>

      <ColorGroup title="Warning (H70)">
        <ColorSwatch
          tailwindClass="bg-warning-tint"
          description="tint"
          oklch="oklch(0.97 0.015 70) | oklch(0.22 0.03 70)"
        />
        <ColorSwatch
          tailwindClass="bg-warning"
          description="accent"
          oklch="oklch(0.68 0.16 70) | oklch(0.72 0.14 70)"
        />
        <ColorSwatch
          tailwindClass="text-warning-foreground"
          description="accent面上の文字"
          oklch="oklch(1 0 0) | oklch(0.15 0 0)"
        />
      </ColorGroup>

      <ColorGroup title="Success (H150)">
        <ColorSwatch
          tailwindClass="bg-success-tint"
          description="tint"
          oklch="oklch(0.95 0.02 150) | oklch(0.22 0.03 150)"
        />
        <ColorSwatch
          tailwindClass="bg-success"
          description="accent"
          oklch="oklch(0.60 0.14 150) | oklch(0.65 0.12 150)"
        />
        <ColorSwatch
          tailwindClass="text-success-foreground"
          description="accent面上の文字"
          oklch="oklch(1 0 0) | oklch(0.15 0 0)"
        />
      </ColorGroup>

      <ColorGroup title="Info (neutral)">
        <ColorSwatch
          tailwindClass="bg-info-tint"
          description="tint（neutral）"
          oklch="oklch(0.96 0.005 260) | oklch(0.22 0.01 260)"
        />
        <ColorSwatch
          tailwindClass="bg-info"
          description="accent（neutral）"
          oklch="oklch(0.55 0.02 260) | oklch(0.65 0.02 260)"
        />
        <ColorSwatch
          tailwindClass="text-info-foreground"
          description="accent面上の文字"
          oklch="oklch(1 0 0) | oklch(0.15 0 0)"
        />
      </ColorGroup>

      {/* ━━ 3. Primary ━━ */}
      <h2 className="text-muted-foreground mt-10 mb-6 text-xs font-bold tracking-widest uppercase">
        3. Primary — ブランドアクション
      </h2>

      <ColorGroup title="Primary">
        <ColorSwatch
          tailwindClass="bg-primary"
          description="主要アクションの背景"
          oklch="oklch(0.45 0.14 260) | oklch(0.50 0.188 260)"
        />
        <ColorSwatch
          tailwindClass="text-primary-foreground"
          description="Primary上のテキスト"
          oklch="oklch(1 0 0)"
        />
      </ColorGroup>

      {/* ━━ 4. State ━━ */}
      <h2 className="text-muted-foreground mt-10 mb-6 text-xs font-bold tracking-widest uppercase">
        4. State — インタラクション
      </h2>
      <p className="text-muted-foreground -mt-4 mb-6 text-xs">
        foreground ベースの半透明オーバーレイ。oklch(from var(--foreground) l c h / α%)。
      </p>

      <ColorGroup title="State Layer（半透明）">
        <ColorSwatch tailwindClass="bg-state-hover" description="hover" oklch="foreground / 10%" />
        <ColorSwatch tailwindClass="bg-state-focus" description="focus" oklch="foreground / 12%" />
        <ColorSwatch
          tailwindClass="bg-state-pressed"
          description="pressed"
          oklch="foreground / 12%"
        />
        <ColorSwatch
          tailwindClass="bg-state-selected"
          description="selected"
          oklch="foreground / 12%"
        />
        <ColorSwatch
          tailwindClass="bg-state-dragged"
          description="dragged"
          oklch="foreground / 16%"
        />
      </ColorGroup>

      <ColorGroup title="State Active（塗りつぶし）">
        <ColorSwatch
          tailwindClass="bg-state-active"
          description="選択中"
          oklch="oklch(0.95 0.025 237) | oklch(0.45 0.14 266)"
        />
        <ColorSwatch
          tailwindClass="text-state-active-foreground"
          description="アクティブ状態テキスト"
          oklch="oklch(0.38 0.14 266) | oklch(0.88 0.06 254)"
        />
      </ColorGroup>

      <ColorGroup title="塗りボタン用ホバー（accent / 90%）">
        <ColorSwatch
          tailwindClass="bg-primary-hover"
          description="primary"
          oklch="oklch(from primary l c h / 90%)"
        />
        <ColorSwatch
          tailwindClass="bg-destructive-hover"
          description="destructive"
          oklch="oklch(from destructive l c h / 90%)"
        />
        <ColorSwatch
          tailwindClass="bg-warning-hover"
          description="warning"
          oklch="oklch(from warning l c h / 90%)"
        />
        <ColorSwatch
          tailwindClass="bg-success-hover"
          description="success"
          oklch="oklch(from success l c h / 90%)"
        />
        <ColorSwatch
          tailwindClass="bg-info-hover"
          description="info"
          oklch="oklch(from info l c h / 90%)"
        />
      </ColorGroup>

      {/* ━━ 5. Domain ━━ */}
      <h2 className="text-muted-foreground mt-10 mb-6 text-xs font-bold tracking-widest uppercase">
        5. Domain — Dayopt 固有
      </h2>

      <ColorGroup title="Tag Colors（oklch統一 L/C、Dark: L+0.13 C-0.03）">
        <ColorSwatch
          tailwindClass="bg-tag-blue"
          description="Blue（デフォルト）"
          oklch="oklch(0.65 0.18 240) | oklch(0.78 0.15 240)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-green"
          description="Green"
          oklch="oklch(0.65 0.18 145) | oklch(0.78 0.15 145)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-red"
          description="Red"
          oklch="oklch(0.65 0.18 25) | oklch(0.78 0.15 25)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-amber"
          description="Amber"
          oklch="oklch(0.65 0.18 80) | oklch(0.78 0.15 80)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-violet"
          description="Violet"
          oklch="oklch(0.65 0.18 310) | oklch(0.78 0.15 310)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-pink"
          description="Pink"
          oklch="oklch(0.65 0.18 350) | oklch(0.78 0.15 350)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-teal"
          description="Teal"
          oklch="oklch(0.65 0.13 185) | oklch(0.78 0.11 185)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-orange"
          description="Orange"
          oklch="oklch(0.65 0.18 55) | oklch(0.78 0.15 55)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-gray"
          description="Gray"
          oklch="oklch(0.55 0.02 250) | oklch(0.70 0.02 250)"
        />
        <ColorSwatch
          tailwindClass="bg-tag-indigo"
          description="Indigo"
          oklch="oklch(0.65 0.18 280) | oklch(0.78 0.15 280)"
        />
      </ColorGroup>

      <ColorGroup title="Chart（比較用5色）">
        <ColorSwatch tailwindClass="bg-chart-1" oklch="oklch(0.62 0.14 260)" />
        <ColorSwatch tailwindClass="bg-chart-2" oklch="oklch(0.55 0.22 263)" />
        <ColorSwatch tailwindClass="bg-chart-3" oklch="oklch(0.49 0.22 264)" />
        <ColorSwatch tailwindClass="bg-chart-4" oklch="oklch(0.42 0.18 266)" />
        <ColorSwatch tailwindClass="bg-chart-5" oklch="oklch(0.38 0.14 266)" />
      </ColorGroup>

      {/* ━━ 6. Aliases ━━ */}
      <h2 className="text-muted-foreground mt-10 mb-6 text-xs font-bold tracking-widest uppercase">
        6. Aliases — shadcn/ui 互換
      </h2>

      <ColorGroup title="Aliases">
        <ColorSwatch tailwindClass="bg-secondary" description="= bg-container" />
        <ColorSwatch tailwindClass="bg-accent" description="= bg-state-active" />
        <ColorSwatch tailwindClass="text-card-foreground" description="= text-foreground" />
      </ColorGroup>
    </div>
  ),
};

export const Surface: Story = {
  render: () => {
    const surfaces = [
      {
        token: 'container',
        role: '沈む',
        desc: 'サイドバー、セクション',
        light: 'oklch(0.96 0 0)',
        dark: 'oklch(0.15 0.008 60)',
        bg: 'bg-container',
      },
      {
        token: 'background',
        role: '基準',
        desc: 'ページ背景',
        light: 'oklch(0.98 0 0)',
        dark: 'oklch(0.18 0.008 60)',
        bg: 'bg-background',
      },
      {
        token: 'card',
        role: '浮く',
        desc: 'カード、ダイアログ',
        light: 'oklch(1.00 0 0)',
        dark: 'oklch(0.22 0.008 60)',
        bg: 'bg-card',
      },
    ] as const;

    const texts = [
      {
        token: 'foreground',
        role: '主要テキスト',
        light: 'oklch(0.13 0 0)',
        dark: 'oklch(0.90 0.005 70)',
      },
      {
        token: 'muted-foreground',
        role: '補助テキスト',
        light: 'oklch(0.40 0 0)',
        dark: 'oklch(0.68 0.005 60)',
      },
    ] as const;

    const shadowValues = {
      sm: {
        light: '0 0 0 1px oklch(0 0 0/0.03), 0 1px 3px oklch(0 0 0/0.03)',
        dark: '0 0 0 1px oklch(1 0 0/0.03), 0 1px 4px oklch(0 0 0/0.18)',
      },
      card: {
        light:
          '0 0 0 1px oklch(0 0 0/0.03), 0 1px 2px oklch(0 0 0/0.04), 0 4px 16px oklch(0 0 0/0.05)',
        dark: '0 0 0 1px oklch(1 0 0/0.04), 0 2px 8px oklch(0 0 0/0.25)',
      },
    } as const;

    return (
      <div>
        <h2 className="mb-2 text-xl font-bold">Surface 体系</h2>
        <p className="text-muted-foreground mb-1 text-sm">
          container(沈む) → background(基準) → card(浮く) + muted。Dark: warm H60 C=0.008。
        </p>
        <p className="text-muted-foreground mb-8 text-sm">
          テキストは純白にしない（dark foreground L=0.90 オフホワイト, C=0.005, H=70）。
        </p>

        {/* ── Elevation bar: 左=暗い → 右=明るい ── */}
        <h3 className="mb-3 font-bold">Elevation（左:沈む → 右:浮く）</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Storybook ツールバーの 🌙 で Light/Dark を切り替えると全プレビューが連動します。
        </p>
        <div className="mb-2 flex gap-0 overflow-hidden rounded-xl">
          {surfaces.map(({ token, bg, role }) => (
            <div
              key={token}
              className={`${bg} flex flex-1 flex-col items-center justify-center py-8`}
            >
              <div className="text-foreground text-sm font-bold">{token}</div>
              <div className="text-muted-foreground text-xs">← {role}</div>
            </div>
          ))}
        </div>
        <div className="mb-8 flex overflow-hidden rounded-xl">
          <div className="bg-muted flex flex-1 flex-col items-center justify-center py-4">
            <div className="text-foreground text-sm font-bold">muted</div>
            <div className="text-muted-foreground text-xs">入力欄・well</div>
          </div>
        </div>

        {/* ── App Layout Preview ── */}
        <h3 className="mb-3 font-bold">Preview</h3>
        <div
          className="bg-background border-border mb-8 grid overflow-hidden rounded-xl border"
          style={{ gridTemplateColumns: '80px 1fr', height: 200 }}
        >
          <div
            className="bg-container flex flex-col gap-1 border-r p-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="bg-foreground h-1.5 w-4/5 rounded opacity-25" />
            <div className="bg-foreground h-1.5 w-3/5 rounded opacity-25" />
            <div className="bg-foreground h-1.5 w-2/3 rounded opacity-25" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div
              className="bg-card flex flex-1 flex-col gap-2 rounded-lg p-4"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="bg-foreground h-1.5 w-3/4 rounded opacity-15" />
              <div className="bg-foreground h-1.5 w-1/2 rounded opacity-15" />
              <div className="bg-muted h-7 rounded" />
            </div>
          </div>
        </div>

        {/* ── Spec Tables ── */}
        <h3 className="mb-3 font-bold">Surface</h3>
        <div className="bg-card border-border mb-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-3 text-left text-xs font-bold">Token</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Light</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Dark (H60 C.008)</th>
                <th className="px-4 py-3 text-left text-xs font-bold">役割</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ...surfaces,
                {
                  token: 'muted',
                  role: '控えめ',
                  desc: '入力欄',
                  light: 'oklch(0.95 0 0)',
                  dark: 'oklch(0.25 0.008 60)',
                  bg: 'bg-muted',
                },
              ].map(({ token, light, dark, role, bg }) => (
                <tr key={token} className="border-border border-b">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`${bg} border-border size-5 shrink-0 rounded border`} />
                      <code className="text-foreground text-xs">{token}</code>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{light}</td>
                  <td className="px-4 py-2 font-mono text-xs">{dark}</td>
                  <td className="px-4 py-2 text-xs">← {role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mb-3 font-bold">Text</h3>
        <div className="bg-card border-border mb-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-3 text-left text-xs font-bold">Token</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Light</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Dark</th>
                <th className="px-4 py-3 text-left text-xs font-bold">役割</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {texts.map(({ token, light, dark, role }) => (
                <tr key={token} className="border-border border-b">
                  <td className="px-4 py-2">
                    <code className="text-foreground text-xs">{token}</code>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{light}</td>
                  <td className="px-4 py-2 font-mono text-xs">{dark}</td>
                  <td className="px-4 py-2 text-xs">{role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Border + Shadow (visual + values) */}
        <h3 className="mb-3 font-bold">Border / Shadow</h3>
        <div className="bg-card border-border mb-2 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-3 text-left text-xs font-bold">Token</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Light</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Dark</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code className="text-foreground text-xs">border</code>
                </td>
                <td className="px-4 py-2 font-mono text-xs">oklch(0 0 0 / 0.06)</td>
                <td className="px-4 py-2 font-mono text-xs">oklch(1 0 0 / 0.07)</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code className="text-foreground text-xs">shadow-sm</code>
                </td>
                <td className="px-4 py-2">
                  <div
                    className="bg-card inline-block size-8 rounded"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                  />
                </td>
                <td className="px-4 py-2">
                  <div
                    className="bg-card inline-block size-8 rounded"
                    style={{ boxShadow: 'var(--shadow-sm)' }}
                  />
                </td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-4 py-2">
                  <code className="text-foreground text-xs">shadow-card</code>
                </td>
                <td className="px-4 py-2">
                  <div
                    className="bg-card inline-block size-8 rounded"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                  />
                </td>
                <td className="px-4 py-2">
                  <div
                    className="bg-card inline-block size-8 rounded"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <details className="text-muted-foreground mb-6 text-xs">
          <summary className="cursor-pointer py-2 font-bold">Shadow コピペ用 oklch 値</summary>
          <div className="bg-card border-border mt-2 space-y-3 rounded-lg border p-4 font-mono">
            <div>
              <div className="text-foreground mb-1 font-sans text-xs font-bold">
                shadow-sm (light)
              </div>
              <div className="break-all">{shadowValues.sm.light}</div>
            </div>
            <div>
              <div className="text-foreground mb-1 font-sans text-xs font-bold">
                shadow-sm (dark)
              </div>
              <div className="break-all">{shadowValues.sm.dark}</div>
            </div>
            <div>
              <div className="text-foreground mb-1 font-sans text-xs font-bold">
                shadow-card (light)
              </div>
              <div className="break-all">{shadowValues.card.light}</div>
            </div>
            <div>
              <div className="text-foreground mb-1 font-sans text-xs font-bold">
                shadow-card (dark)
              </div>
              <div className="break-all">{shadowValues.card.dark}</div>
            </div>
          </div>
        </details>
      </div>
    );
  },
};

export const Semantic: Story = {
  render: () => {
    const semanticColors = [
      {
        name: 'Destructive',
        hue: 25,
        bg: 'bg-destructive',
        bgTint: 'bg-destructive-tint',
        text: 'text-destructive',
        fg: 'text-destructive-foreground',
        desc: '削除、エラー',
        lightAccent: 'oklch(0.58 0.16 25)',
        lightBg: 'oklch(0.96 0.015 25)',
        darkAccent: 'oklch(0.62 0.14 25)',
        darkBg: 'oklch(0.22 0.03 25)',
      },
      {
        name: 'Warning',
        hue: 70,
        bg: 'bg-warning',
        bgTint: 'bg-warning-tint',
        text: 'text-warning',
        fg: 'text-warning-foreground',
        desc: '警告、注意',
        lightAccent: 'oklch(0.68 0.16 70)',
        lightBg: 'oklch(0.97 0.015 70)',
        darkAccent: 'oklch(0.72 0.14 70)',
        darkBg: 'oklch(0.22 0.03 70)',
      },
      {
        name: 'Success',
        hue: 150,
        bg: 'bg-success',
        bgTint: 'bg-success-tint',
        text: 'text-success',
        fg: 'text-success-foreground',
        desc: '成功、完了',
        lightAccent: 'oklch(0.60 0.14 150)',
        lightBg: 'oklch(0.95 0.02 150)',
        darkAccent: 'oklch(0.65 0.12 150)',
        darkBg: 'oklch(0.22 0.03 150)',
      },
      {
        name: 'Info',
        hue: 'neutral',
        bg: 'bg-info',
        bgTint: 'bg-info-tint',
        text: 'text-info',
        fg: 'text-info-foreground',
        desc: '情報（neutral）',
        lightAccent: 'oklch(0.55 0.02 260)',
        lightBg: 'oklch(0.96 0.005 260)',
        darkAccent: 'oklch(0.65 0.02 260)',
        darkBg: 'oklch(0.22 0.01 260)',
      },
    ] as const;

    return (
      <div>
        <h2 className="mb-2 text-xl font-bold">Semantic Colors（bg + accent 体系）</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          destructive/warning/success は同じ L/C 構造で hue のみ変化。info は
          neutral（低彩度）。accent(テキスト・アイコン用) + tint(薄い背景用) の2トークン体系。
        </p>

        {/* accent + bg tint swatches */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {semanticColors.map(({ name, bg, bgTint, fg, desc }) => (
            <div key={name} className="border-border rounded-lg border p-4">
              <div className={`${bg} mb-2 flex h-10 items-center justify-center rounded`}>
                <span className={`${fg} text-sm font-bold`}>accent</span>
              </div>
              <div className={`${bgTint} mb-2 flex h-10 items-center justify-center rounded`}>
                <span className="text-foreground text-sm">bg</span>
              </div>
              <div className="text-foreground text-center font-bold">{name}</div>
              <div className="text-muted-foreground text-center text-xs">{desc}</div>
            </div>
          ))}
        </div>

        {/* oklch spec table */}
        <h3 className="mb-3 font-bold">oklch 値</h3>
        <div className="bg-card border-border mb-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-3 text-left text-xs font-bold">色</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Hue</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Light accent</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Light bg</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Dark accent</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Dark bg</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {semanticColors.map(({ name, hue, lightAccent, lightBg, darkAccent, darkBg }) => (
                <tr key={name} className="border-border border-b">
                  <td className="text-foreground px-4 py-2 text-xs font-bold">{name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{hue}</td>
                  <td className="px-4 py-2 font-mono text-xs">{lightAccent}</td>
                  <td className="px-4 py-2 font-mono text-xs">{lightBg}</td>
                  <td className="px-4 py-2 font-mono text-xs">{darkAccent}</td>
                  <td className="px-4 py-2 font-mono text-xs">{darkBg}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
