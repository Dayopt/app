import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const meta = {
  title: 'Foundations/States',
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
      <h1 className="mb-2 text-2xl font-bold">States（使い方とデモ）</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        State トークンの定義は{' '}
        <a href="?path=/story/foundations-colors--all-colors" className="text-primary underline">
          Color ページ &gt; State セクション
        </a>
        を参照。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* Button States */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-2 text-lg font-bold">Button States（触って確認）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            実際にホバー・Tab フォーカス・クリックして状態変化を確認。
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Default */}
            <div>
              <h3 className="text-muted-foreground mb-3 text-sm font-bold">default</h3>
              <div className="flex flex-wrap gap-3">
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
              <h3 className="text-muted-foreground mb-3 text-sm font-bold">outline</h3>
              <div className="flex flex-wrap gap-3">
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
              <h3 className="text-muted-foreground mb-3 text-sm font-bold">ghost</h3>
              <div className="flex flex-wrap gap-3">
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
              <h3 className="text-muted-foreground mb-3 text-sm font-bold">destructive</h3>
              <div className="flex flex-wrap gap-3">
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
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-2 text-lg font-bold">Input States（触って確認）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            フォーカスして ring を確認。Error は aria-invalid で自動適用。
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-bold">Default</p>
              <Input placeholder="入力してください" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-bold">Focus（Tab で確認）</p>
              <Input placeholder="フォーカスしてみて" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-bold">Error</p>
              <Input placeholder="エラー" aria-invalid="true" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-bold">Disabled</p>
              <Input placeholder="無効" disabled />
            </div>
          </div>
        </section>

        {/* 実装ガイド */}
        <section className="bg-card border-border rounded-xl border p-6">
          <h2 className="mb-4 text-lg font-bold">実装ガイド（コピペ用）</h2>
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
bg-destructive hover:bg-destructive-hover`}
          </pre>
        </section>
      </div>
    </div>
  ),
};
