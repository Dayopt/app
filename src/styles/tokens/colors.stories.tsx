import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CHRONOTYPE_PRESETS } from '@/features/chronotype/lib/constants';
import { generateChronotypeGradient } from '@/features/chronotype/lib/gradient';

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
            <span className="text-muted-foreground">H軸</span> = 意味（blue=primary, amber=warning,
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
          description="構造的な区切り（sidebar, input, divider）"
          oklch="oklch(0 0 0 / 0.12) | oklch(1 0 0 / 0.12)"
        />
        <ColorSwatch
          tailwindClass="border-border-subtle"
          description="Raised/Overlayの縁（card, dialog, popover）"
          oklch="oklch(0 0 0 / 0.06) | oklch(1 0 0 / 0.07)"
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

      <ColorGroup title="Tag Colors（oklch統一 L/C、Hのみ変化）">
        {/* Base: L=0.65 C=0.18 / Dark: L=0.78 C=0.15（例外: teal, gray） */}
        {[
          { name: 'red', hue: 25 },
          { name: 'orange', hue: 55 },
          { name: 'amber', hue: 80 },
          { name: 'green', hue: 145 },
          { name: 'teal', hue: 185, lightC: 0.13, darkC: 0.11, note: 'sRGB色域制限' },
          { name: 'blue', hue: 240, note: 'デフォルト' },
          { name: 'indigo', hue: 280 },
          { name: 'violet', hue: 310 },
          { name: 'pink', hue: 350 },
          {
            name: 'gray',
            hue: 250,
            lightL: 0.55,
            lightC: 0.02,
            darkL: 0.7,
            darkC: 0.02,
            note: 'achromatic',
          },
        ].map(({ name, hue, note, lightL = 0.65, lightC = 0.18, darkL = 0.78, darkC = 0.15 }) => (
          <ColorSwatch
            key={name}
            tailwindClass={`bg-tag-${name}`}
            description={`${name}${note ? `（${note}）` : ''}`}
            oklch={`oklch(${lightL} ${lightC} ${hue}) | oklch(${darkL} ${darkC} ${hue})`}
          />
        ))}
      </ColorGroup>

      <ColorGroup title="Chronotype（タイムライン）">
        {/* 背景色（gradient） */}
        {[
          {
            name: 'deep-bg',
            label: 'deep 背景（gradient）',
            light: 'oklch(0.955 0.008 70)',
            dark: 'oklch(0.21 0.018 70)',
          },
          {
            name: 'ease-bg',
            label: 'ease 背景（gradient）',
            light: 'oklch(0.955 0.008 150)',
            dark: 'oklch(0.21 0.018 150)',
          },
        ].map(({ name, label, light, dark }) => (
          <ColorSwatch
            key={name}
            tailwindClass={`chronotype-${name}`}
            description={label}
            oklch={`${light} | ${dark}`}
          />
        ))}
        {/* テキスト色（ラベル） */}
        {[
          {
            name: 'deep',
            label: 'deep テキスト（ラベル）',
            light: 'oklch(0.65 0.15 70)',
            dark: 'oklch(0.80 0.12 70)',
          },
          {
            name: 'ease',
            label: 'ease テキスト（ラベル）',
            light: 'oklch(0.55 0.15 150)',
            dark: 'oklch(0.75 0.12 150)',
          },
        ].map(({ name, label, light, dark }) => (
          <ColorSwatch
            key={name}
            tailwindClass={`chronotype-${name}`}
            description={label}
            oklch={`${light} | ${dark}`}
          />
        ))}
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

export const Text: Story = {
  render: () => {
    const neutralTexts = [
      {
        token: 'text-foreground',
        cls: 'text-foreground',
        label: '主要（見出し、本文）',
        light: 'oklch(0.13 0 0)',
        dark: 'oklch(0.90 0.005 70)',
      },
      {
        token: 'text-muted-foreground',
        cls: 'text-muted-foreground',
        label: '補助（説明、キャプション）',
        light: 'oklch(0.40 0 0)',
        dark: 'oklch(0.68 0.005 60)',
      },
    ] as const;

    const semanticTexts = [
      { token: 'text-primary', cls: 'text-primary', label: 'リンク、アクション' },
      { token: 'text-destructive', cls: 'text-destructive', label: 'エラー H25' },
      { token: 'text-warning', cls: 'text-warning', label: '警告 H70' },
      { token: 'text-success', cls: 'text-success', label: '成功 H150' },
      { token: 'text-info', cls: 'text-info', label: '情報 H260' },
    ] as const;

    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">テキストカラー</h1>
        <p className="text-muted-foreground mb-2 text-sm">
          Neutral 2段階で9割のUIが完結。Semantic は意味があるときだけ。
        </p>
        <p className="text-muted-foreground mb-8 text-sm">
          Dark: 純白にしない（L=0.90 オフホワイト, C=0.005, H=70）。
        </p>

        {/* ── Hierarchy bar ── */}
        <h3 className="mb-3 font-bold">Hierarchy（左:主要 → 右:補助）</h3>
        <div className="bg-background border-border mb-8 flex overflow-hidden rounded-xl border">
          <div className="flex flex-1 flex-col items-center justify-center py-8">
            <span className="text-foreground text-lg font-bold">foreground</span>
            <span className="text-foreground text-sm">主要テキスト</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center py-8">
            <span className="text-muted-foreground text-lg font-bold">muted-foreground</span>
            <span className="text-muted-foreground text-sm">補助テキスト</span>
          </div>
        </div>

        {/* ── Contrast check: on card / on background ── */}
        <h3 className="mb-3 font-bold">コントラスト確認</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Storybook ツールバーの 🌙 で Light/Dark を切り替えて確認。
        </p>
        <div className="mb-8 grid grid-cols-2 gap-4">
          <div className="bg-card rounded-xl p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="text-muted-foreground mb-1 text-xs">on card</div>
            <p className="text-foreground text-sm font-bold">foreground — 見出しや本文に使用</p>
            <p className="text-muted-foreground mt-2 text-sm">
              muted-foreground — 説明文やキャプション
            </p>
          </div>
          <div className="bg-background border-border rounded-xl border p-6">
            <div className="text-muted-foreground mb-1 text-xs">on background</div>
            <p className="text-foreground text-sm font-bold">foreground — 見出しや本文に使用</p>
            <p className="text-muted-foreground mt-2 text-sm">
              muted-foreground — 説明文やキャプション
            </p>
          </div>
        </div>

        {/* ── Spec table: Neutral ── */}
        <h3 className="mb-3 font-bold">Neutral</h3>
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
              {neutralTexts.map(({ token, cls, light, dark, label }) => (
                <tr key={token} className="border-border border-b">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`${cls} size-4 shrink-0 rounded-full bg-current`} />
                      <code className="text-foreground text-xs">{token}</code>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{light}</td>
                  <td className="px-4 py-2 font-mono text-xs">{dark}</td>
                  <td className="px-4 py-2 text-xs">{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Spec table: Semantic ── */}
        <h3 className="mb-3 font-bold">Semantic（意味があるときだけ）</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          値は Color &gt; Semantic の accent と同じ。text-* と bg-* が同一トークンを参照。
        </p>
        <div className="bg-card border-border mb-6 rounded-xl border">
          <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
            {semanticTexts.map(({ token, cls, label }) => (
              <div key={token} className="flex flex-col items-center gap-2">
                <div
                  className={`${cls} bg-background border-border flex size-12 items-center justify-center rounded-lg border text-lg font-bold`}
                >
                  Aa
                </div>
                <code className="text-xs">{token.replace('text-', '')}</code>
                <span className="text-muted-foreground text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Usage guide ── */}
        <h3 className="mb-3 font-bold">使い分けガイド</h3>
        <div className="bg-card border-border rounded-xl border p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <p className="text-success font-bold">Do</p>
              <pre className="text-muted-foreground text-xs leading-relaxed">{`// 主要テキスト
<h1 className="text-foreground">見出し</h1>

// 補助テキスト
<p className="text-muted-foreground">説明</p>

// リンク
<a className="text-primary">リンク</a>

// エラーメッセージ
<p className="text-destructive">入力エラー</p>`}</pre>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <p className="text-destructive font-bold">Don&apos;t</p>
              <pre className="text-muted-foreground text-xs leading-relaxed">{`// ❌ 直接カラー
<h1 className="text-gray-900">見出し</h1>

// ❌ opacity で階層を作る
<p className="text-foreground opacity-50">説明</p>

// ❌ 意味なく semantic を使う
<p className="text-success">普通のテキスト</p>`}</pre>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

export const Tags: Story = {
  render: () => {
    const tags: ReadonlyArray<{ name: string; hue: number; note?: string }> = [
      { name: 'blue', hue: 240, note: 'デフォルト' },
      { name: 'green', hue: 145 },
      { name: 'red', hue: 25 },
      { name: 'amber', hue: 80 },
      { name: 'violet', hue: 310 },
      { name: 'pink', hue: 350 },
      { name: 'teal', hue: 185, note: 'C=0.13（sRGB色域制限）' },
      { name: 'orange', hue: 55 },
      { name: 'gray', hue: 250, note: 'achromatic C=0.02' },
      { name: 'indigo', hue: 280 },
    ];

    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">タグカラー</h1>
        <p className="text-muted-foreground mb-2 text-sm">
          ユーザーがタグに設定できる10色。oklch 統一 L/C で Hue のみ変化。
        </p>
        <p className="text-muted-foreground mb-8 text-sm">
          Light: L=0.65 C=0.18 → Dark: L=0.78 C=0.15（明度+0.13, 彩度-0.03）。
        </p>

        {/* ── Base + Tint 並列表示 ── */}
        <h3 className="mb-3 font-bold">Base / Tint 一覧</h3>
        <div className="bg-card border-border mb-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-3 text-left text-xs font-bold">色</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Base</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Tint</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Hue</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Light base</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Dark base</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {tags.map(({ name, hue, note }) => (
                <tr key={name} className="border-border border-b">
                  <td className="px-4 py-2 text-xs font-bold capitalize">{name}</td>
                  <td className="px-4 py-2">
                    <div
                      className="size-6 rounded"
                      style={{ backgroundColor: `var(--tag-${name})` }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div
                      className="border-border size-6 rounded border"
                      style={{ backgroundColor: `var(--tag-${name}-tint)` }}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {hue}
                    {note && (
                      <span className="text-muted-foreground ml-1 font-sans text-xs">{note}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    oklch(0.65 {name === 'teal' ? '0.13' : name === 'gray' ? '0.02' : '0.18'} {hue})
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    oklch(0.78 {name === 'teal' ? '0.11' : name === 'gray' ? '0.02' : '0.15'} {hue})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Tint 構造 ── */}
        <h3 className="mb-3 font-bold">Tint（EntryCard 背景色）</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Light: L=0.92 C=0.05。Dark: L=0.28 C=0.06（低明度でも色味を識別可能）。
        </p>
        <div className="mb-8 flex flex-wrap gap-2">
          {tags.map(({ name }) => (
            <div
              key={name}
              className="border-border flex h-16 w-20 flex-col items-center justify-center rounded-lg border"
              style={{ backgroundColor: `var(--tag-${name}-tint)` }}
            >
              <span className="text-foreground text-xs font-bold">{name}</span>
              <span className="text-muted-foreground text-xs">tint</span>
            </div>
          ))}
        </div>

        {/* ── 使用例 ── */}
        <h3 className="mb-3 font-bold">使用例</h3>
        <div className="bg-card border-border rounded-xl border p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {tags.map(({ name }) => (
              <span
                key={name}
                className="rounded-full border px-3 py-1 text-sm capitalize"
                style={{ borderColor: `var(--tag-${name})`, color: `var(--tag-${name})` }}
              >
                {name}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            <code>border-tag-*</code> + <code>text-tag-*</code> でアウトラインバッジ。 EntryCard
            背景は <code>bg-tag-*-tint</code>。
          </p>
        </div>
      </div>
    );
  },
};

export const DosDonts: Story = {
  render: () => {
    const rules = [
      {
        title: '1. セマンティックトークンを使う',
        doCode: 'bg-destructive text-destructive-foreground',
        dontCode: 'bg-red-500 text-white',
        reason:
          'oklch の値を直接書かない。トークン経由で使う。直接指定するとダークモード切替、将来の色調整が全部壊れる。',
      },
      {
        title: '2. Surface の階層を守る',
        doCode: 'container(沈む) → background(基準) → card(浮く)',
        dontCode: 'card の中に background、background の中に card',
        reason:
          '判断基準: ユーザーの目がそこに行くべきか？ 行くべき → card（浮かせる）。行かなくていい → container / muted（沈める）。',
      },
      {
        title: '3. 色は意味があるときだけつける',
        doCode: 'ほとんどのUIは neutral（surface + text-foreground）で完結',
        dontCode: '意味なく色をつけて画面をカラフルにする',
        reason:
          '色を足す前に「これを灰色にしたら情報が失われるか？」と問う。失われないなら neutral のまま。9割のUIは Step 1 で終わる。',
      },
      {
        title: '4. Semantic の色と意味を一致させる',
        doCode: '成功→green、エラー→red、警告→amber、情報→blue',
        dontCode: '成功を青で、エラーを黄色で表示',
        reason: '色の意味が揺れると、ユーザーが毎回「この色は何？」と考える負荷が発生する。',
      },
      {
        title: '5. 色だけで情報を伝えない',
        doCode: '<CheckCircle /> 完了 — 色+アイコン+テキストの三重伝達',
        dontCode: '<span className="text-success">完了</span> — 色だけ',
        reason: 'WCAG 1.4.1: 色を唯一の視覚的手段にしない。色覚多様性のユーザーが識別できない。',
      },
      {
        title: '6. テキストコントラストを確保する',
        doCode: 'text-foreground on bg-card\ntext-primary-foreground on bg-primary',
        dontCode: 'text-muted-foreground on bg-primary\nopacity-50 のテキスト',
        reason:
          'WCAG AA: コントラスト比 4.5:1 以上。Dark のテキストは L=0.90（オフホワイト）なので暗い背景との比率を確認する。',
      },
      {
        title: '7. Semantic の強度を用途に合わせる',
        doCode: '背景にうっすら → bg-info-tint\nはっきり → bg-info\nテキスト → text-info',
        dontCode: 'accent（bg-info）をセクション全体の背景に\ntint（bg-info-tint）をボタンに',
        reason: '薄い色を広い面に、強い色を小さい要素に。逆にすると画面がうるさくなる。',
      },
      {
        title: '8. Dark で oklch を手動で反転しない',
        doCode: 'トークンを使う。Light/Dark の切替はトークンが処理する',
        dontCode: 'dark:bg-[oklch(0.22_0.008_60)] と直接書く',
        reason:
          '値を直接書くとトークンの体系から外れて、色調整時に見落とされる「野良の色」になる。',
      },
    ] as const;

    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">Do&apos;s &amp; Don&apos;ts</h1>
        <p className="text-muted-foreground mb-8">カラー使用のベストプラクティス。</p>

        <div className="grid max-w-5xl gap-6">
          {rules.map(({ title, doCode, dontCode, reason }) => (
            <section key={title} className="bg-card border-border rounded-xl border p-6">
              <h2 className="mb-4 text-lg font-bold">{title}</h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="border-success space-y-2 border-l-4 pl-4">
                  <p className="text-success text-sm font-bold">Do</p>
                  <pre className="text-foreground text-xs whitespace-pre-wrap">{doCode}</pre>
                </div>
                <div className="border-destructive space-y-2 border-l-4 pl-4">
                  <p className="text-destructive text-sm font-bold">Don&apos;t</p>
                  <pre className="text-muted-foreground text-xs whitespace-pre-wrap">
                    {dontCode}
                  </pre>
                </div>
              </div>
              <p className="text-muted-foreground mt-4 text-sm">{reason}</p>
            </section>
          ))}
        </div>
      </div>
    );
  },
};

/** タイムラインプレビュー（Light / Dark 共通ヘルパー） */
function TimelinePreview({
  gradient,
  zones,
  isDark,
}: {
  gradient: string;
  zones: readonly { startHour: number; endHour: number; level: string }[];
  isDark: boolean;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div
      className="relative h-[480px] rounded-lg"
      style={{
        backgroundImage: gradient,
        ...(isDark && { backgroundColor: 'oklch(0.18 0.008 60)' }),
      }}
    >
      {hours.map((hour) => {
        const zone = zones.find(
          (z) =>
            (z.level === 'deep' || z.level === 'ease') && hour >= z.startHour && hour < z.endHour,
        );
        const show = hour % 2 === 0;
        if (!show) return null;
        return (
          <div
            key={hour}
            className={`absolute left-3 text-xs ${
              zone?.level === 'deep'
                ? 'text-chronotype-deep font-bold'
                : zone?.level === 'ease'
                  ? 'text-chronotype-ease font-bold'
                  : isDark
                    ? 'text-white/30'
                    : 'opacity-30'
            }`}
            style={{ top: `${(hour / 24) * 100}%` }}
          >
            {String(hour).padStart(2, '0')}:00
          </div>
        );
      })}
      {/* ゾーンラベル */}
      {zones
        .filter((z) => z.level === 'deep' || z.level === 'ease')
        .map((z) => (
          <div
            key={z.level}
            className={`absolute right-3 text-xs font-bold ${
              z.level === 'deep' ? 'text-chronotype-deep' : 'text-chronotype-ease'
            }`}
            style={{ top: `${((z.startHour + z.endHour) / 2 / 24) * 100}%` }}
          >
            {z.level}
          </div>
        ))}
    </div>
  );
}

export const Chronotype: Story = {
  tags: [],
  render: function ChronotypeStory() {
    const [selectedType, setSelectedType] = useState<'bear' | 'lion' | 'wolf' | 'dolphin'>('bear');
    const zones = CHRONOTYPE_PRESETS[selectedType].productivityZones;
    const lightGradient = generateChronotypeGradient(zones, 'light');
    const darkGradient = generateChronotypeGradient(zones, 'dark');

    return (
      <div className="space-y-8">
        {/* ===== 概要 ===== */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-2 text-lg font-bold">Chronotype タイムライン</h2>
          <p className="text-muted-foreground text-sm">
            ユーザーのクロノタイプに応じて、タイムラインに deep / ease ゾーンを視覚的に表示する。
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs font-bold">背景 gradient</p>
              <p className="text-muted-foreground mt-1 text-xs">
                低彩度の帯で「ここはゾーン内」を伝える
              </p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs font-bold">時刻ラベル色</p>
              <p className="text-muted-foreground mt-1 text-xs">
                高彩度テキスト + 太字でゾーン範囲を強調
              </p>
            </div>
          </div>
        </section>

        {/* ===== カラーパレット ===== */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h3 className="mb-4 text-sm font-bold">カラーパレット（2 色体制）</h3>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Deep */}
            <div className="space-y-3">
              <p className="text-chronotype-deep text-xs font-bold tracking-widest uppercase">
                Deep（H=70 暖色）
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="border-border size-10 shrink-0 rounded-md border"
                  style={{ backgroundColor: 'oklch(0.955 0.008 70)' }}
                />
                <div>
                  <p className="text-xs font-bold">背景</p>
                  <p className="font-mono text-xs opacity-40">L0.955 C0.008</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-chronotype-deep size-10 shrink-0 rounded-md" />
                <div>
                  <p className="text-xs font-bold">テキスト</p>
                  <p className="font-mono text-xs opacity-40">Light 0.65/0.15 — Dark 0.80/0.12</p>
                </div>
              </div>
            </div>
            {/* Ease */}
            <div className="space-y-3">
              <p className="text-chronotype-ease text-xs font-bold tracking-widest uppercase">
                Ease（H=150 寒色）
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="border-border size-10 shrink-0 rounded-md border"
                  style={{ backgroundColor: 'oklch(0.955 0.008 150)' }}
                />
                <div>
                  <p className="text-xs font-bold">背景</p>
                  <p className="font-mono text-xs opacity-40">L0.955 C0.008</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-chronotype-ease size-10 shrink-0 rounded-md" />
                <div>
                  <p className="text-xs font-bold">テキスト</p>
                  <p className="font-mono text-xs opacity-40">Light 0.55/0.15 — Dark 0.75/0.12</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== タイムラインプレビュー ===== */}
        <section className="bg-card border-border rounded-xl border p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold">タイムラインプレビュー</h3>
            <div className="flex gap-1">
              {(['bear', 'lion', 'wolf', 'dolphin'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    selectedType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-state-hover'
                  }`}
                >
                  {CHRONOTYPE_PRESETS[type].name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-bold">Light</p>
              <div className="border-border overflow-hidden rounded-lg border">
                <TimelinePreview gradient={lightGradient} zones={zones} isDark={false} />
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-bold">Dark</p>
              <div className="overflow-hidden rounded-lg border border-white/10">
                <TimelinePreview gradient={darkGradient} zones={zones} isDark />
              </div>
            </div>
          </div>
        </section>

        {/* ===== 仕様 ===== */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h3 className="mb-4 text-sm font-bold">oklch 仕様</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-2 py-2 text-left text-xs font-bold">レイヤー</th>
                <th className="px-2 py-2 text-left text-xs font-bold">Light</th>
                <th className="px-2 py-2 text-left text-xs font-bold">Dark</th>
                <th className="px-2 py-2 text-left text-xs font-bold">用途</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-border border-b">
                <td className="px-2 py-2 font-bold">deep 背景</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.955 0.008 70)</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.21 0.018 70)</td>
                <td className="px-2 py-2 text-xs">gradient 帯</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-2 py-2 font-bold">deep テキスト</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.65 0.15 70)</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.80 0.12 70)</td>
                <td className="px-2 py-2 text-xs">時刻ラベル</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-2 py-2 font-bold">ease 背景</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.955 0.008 150)</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.21 0.018 150)</td>
                <td className="px-2 py-2 text-xs">gradient 帯</td>
              </tr>
              <tr className="border-border border-b">
                <td className="px-2 py-2 font-bold">ease テキスト</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.55 0.15 150)</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.75 0.12 150)</td>
                <td className="px-2 py-2 text-xs">時刻ラベル</td>
              </tr>
              <tr>
                <td className="px-2 py-2 font-bold">other</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.98 0 0)</td>
                <td className="px-2 py-2 font-mono text-xs">oklch(0.18 0 0)</td>
                <td className="px-2 py-2 text-xs">bg-background</td>
              </tr>
            </tbody>
          </table>
          <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>境界: smoothstep（r=0.8h, flat top）</span>
            <span>CSS linear-gradient 1 本</span>
            <span>サーバー事前計算</span>
          </div>
        </section>
      </div>
    );
  },
};
