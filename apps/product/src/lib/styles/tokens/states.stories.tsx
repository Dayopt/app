import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button, Input } from '@dayopt/components';

const meta = {
  title: 'Shared/Foundations/States',
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
      <h1 className="mb-2 text-2xl font-medium">States（使い方とデモ）</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        State トークンの定義は{' '}
        <a href="?path=/story/foundations-colors--all-colors" className="text-primary underline">
          Color ページ &gt; State セクション
        </a>
        を参照。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* State Layer一覧（MD3準拠） */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-2 text-lg font-medium">State Layer 一覧（MD3 準拠）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            foreground ベースの半透明オーバーレイ。ライト/ダークモードで自動調整される。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">状態</th>
                  <th className="py-2 text-left font-medium">トークン</th>
                  <th className="py-2 text-left font-medium">不透明度</th>
                  <th className="py-2 text-left font-medium">用途</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  {
                    state: 'Hover',
                    token: 'bg-state-hover',
                    opacity: '10%',
                    usage: 'マウスオーバー時',
                  },
                  {
                    state: 'Pressed',
                    token: 'bg-state-pressed',
                    opacity: '12%',
                    usage: 'クリック中',
                  },
                  {
                    state: 'Selected',
                    token: 'bg-state-selected',
                    opacity: '12%',
                    usage: '選択状態',
                  },
                  {
                    state: 'Dragged',
                    token: 'bg-state-dragged',
                    opacity: '16%',
                    usage: 'ドラッグ中',
                  },
                  {
                    state: 'Active',
                    token: 'bg-state-active',
                    opacity: '塗り',
                    usage: '選択中（塗りつぶし）',
                  },
                ].map(({ state, token, opacity, usage }, i, arr) => (
                  <tr key={state} className={i < arr.length - 1 ? 'border-border border-b' : ''}>
                    <td className="py-2">{state}</td>
                    <td className="py-2">
                      <code>{token}</code>
                    </td>
                    <td className="py-2">{opacity}</td>
                    <td className="py-2">{usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Button States */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-2 text-lg font-medium">Button States（触って確認）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            実際にホバー・Tab フォーカス・クリックして状態変化を確認。
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Default */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">default</h3>
              <div className="flex flex-wrap gap-2">
                <div className="space-y-1 text-center">
                  <Button>Default</Button>
                  <p className="text-muted-foreground text-xs">通常</p>
                </div>
                <div className="space-y-1 text-center">
                  <Button disabled>Disabled</Button>
                  <p className="text-muted-foreground text-xs">無効</p>
                </div>
              </div>
            </div>

            {/* Outline */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">outline</h3>
              <div className="flex flex-wrap gap-2">
                <div className="space-y-1 text-center">
                  <Button variant="outline">Default</Button>
                  <p className="text-muted-foreground text-xs">通常</p>
                </div>
                <div className="space-y-1 text-center">
                  <Button variant="outline" disabled>
                    Disabled
                  </Button>
                  <p className="text-muted-foreground text-xs">無効</p>
                </div>
              </div>
            </div>

            {/* Ghost */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">ghost</h3>
              <div className="flex flex-wrap gap-2">
                <div className="space-y-1 text-center">
                  <Button variant="ghost">Default</Button>
                  <p className="text-muted-foreground text-xs">通常</p>
                </div>
                <div className="space-y-1 text-center">
                  <Button variant="ghost" disabled>
                    Disabled
                  </Button>
                  <p className="text-muted-foreground text-xs">無効</p>
                </div>
              </div>
            </div>

            {/* Destructive */}
            <div>
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">destructive</h3>
              <div className="flex flex-wrap gap-2">
                <div className="space-y-1 text-center">
                  <Button variant="destructive">Default</Button>
                  <p className="text-muted-foreground text-xs">通常</p>
                </div>
                <div className="space-y-1 text-center">
                  <Button variant="destructive" disabled>
                    Disabled
                  </Button>
                  <p className="text-muted-foreground text-xs">無効</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Input States */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-2 text-lg font-medium">Input States（触って確認）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            フォーカスして ring を確認。Error は aria-invalid で自動適用。
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">Default</p>
              <Input placeholder="入力してください" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">Focus（Tab で確認）</p>
              <Input placeholder="フォーカスしてみて" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">Error</p>
              <Input placeholder="エラー" aria-invalid="true" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">Disabled</p>
              <Input placeholder="無効" disabled />
            </div>
          </div>
        </section>

        {/* 実装ガイド */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">実装ガイド（コピペ用）</h2>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-xs leading-relaxed">
            {`// hover（10% overlay）
hover:bg-state-hover

// focus（キーボード操作時のみ）
focus-visible:ring-2 focus-visible:ring-primary

// pressed（12% overlay）
active:bg-state-pressed

// selected（12% overlay）
data-[state=selected]:bg-state-selected

// dragged（16% overlay）
// ドラッグライブラリの状態に応じて付与
bg-state-dragged

// active（塗りつぶし — サイドバーの選択項目等）
bg-state-active text-state-active-foreground

// disabled
disabled={true}
// className 側: opacity-50 pointer-events-none

// error（Input）
aria-invalid="true"
// Input コンポーネントが aria-invalid:border-destructive を自動適用

// 塗りボタンのホバー（accent / 90%）
bg-primary hover:bg-primary-hover
bg-destructive hover:bg-destructive-hover

// リンク/テキストホバー
text-primary underline decoration-primary/30 hover:decoration-primary  // 下線リンク
text-primary hover:underline                                           // ホバー下線
text-muted-foreground hover:text-foreground                            // 色変化`}
          </pre>
        </section>
      </div>
    </div>
  ),
};
