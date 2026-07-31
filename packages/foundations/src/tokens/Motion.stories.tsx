import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useCallback, useState } from 'react';

const meta = {
  title: 'Shared/Foundations/Motion',
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
      <h1 className="mb-2 text-2xl font-medium">Motion</h1>
      <p className="text-muted-foreground mb-8">
        実際の動きを触って確かめる見本。方針と段階の定義は{' '}
        <a href="?path=/docs/shared-foundations-motion--docs" className="underline">
          Motion 方針
        </a>{' '}
        が正本。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* shadcn/ui標準 */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">shadcn/ui標準（animate-in/out）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            ダイアログ、ポップオーバー等のマウント/アンマウント時に使用
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimationCard
              name="fade-in"
              className="animate-in fade-in"
              description="フェードイン"
            />
            <AnimationCard
              name="zoom-in-95"
              className="animate-in zoom-in-95"
              description="95%からズームイン"
            />
            <AnimationCard
              name="slide-in-from-bottom"
              className="animate-in slide-in-from-bottom-2"
              description="下からスライド"
            />
            <AnimationCard
              name="slide-in-from-top"
              className="animate-in slide-in-from-top-2"
              description="上からスライド"
            />
            <AnimationCard
              name="slide-in-from-left"
              className="animate-in slide-in-from-left-2"
              description="左からスライド"
            />
            <AnimationCard
              name="slide-in-from-right"
              className="animate-in slide-in-from-right-2"
              description="右からスライド"
            />
          </div>
          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// ダイアログ例
className="animate-in fade-in zoom-in-95 duration-150"

// シートの例（下から）
className="animate-in slide-in-from-bottom duration-200"

// data-stateと組み合わせ
data-[state=open]:animate-in
data-[state=closed]:animate-out`}
          </pre>
        </section>

        {/* ローディング */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">ローディング（GAFA準拠）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            スケルトンローダー用。shimmerはFacebook/LinkedIn方式。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">animate-shimmer</div>
              <div className="animate-shimmer h-16 rounded-lg" />
              <p className="text-muted-foreground text-xs">左→右の波（推奨）</p>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">animate-pulse</div>
              <div className="bg-muted h-16 animate-pulse rounded-lg" />
              <p className="text-muted-foreground text-xs">フェードイン/アウト（フォールバック）</p>
            </div>
          </div>
          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// スケルトンローダー
<div className="animate-shimmer h-4 rounded-lg" />

// 汎用ローディング（画像等）
<div className="bg-muted animate-pulse h-32 rounded-lg" />`}
          </pre>
        </section>

        {/* エラーフィードバック */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">エラーフィードバック</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            入力エラー時のシェイクアニメーション（Apple HIG準拠）
          </p>
          <ShakeDemo />
          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// エラー時に適用
<input className={error ? 'animate-shake' : ''} />`}
          </pre>
        </section>

        {/* Transition */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">Transition（日常インタラクション）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            ホバー、フォーカス、状態変化など日常的なインタラクションに使用。 animate-in/out
            はマウント/アンマウント用、こちらは CSS transition 用。
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <TransitionDemo
              name="transition-colors"
              className="transition-colors duration-150"
              description="色のみ変化（標準）"
            />
            <TransitionDemo
              name="transition-all"
              className="transition-all duration-150"
              description="サイズ変化を含む"
            />
            <TransitionDemo
              name="transition-transform"
              className="transition-transform duration-200"
              description="transform のみ"
            />
          </div>
          <pre className="bg-container mt-4 overflow-x-auto rounded-lg p-4 text-xs">
            {`// デフォルト — 迷ったらこれ
<button className="transition-colors duration-150 hover:bg-accent">

// サイズ変化を含む
<div className="transition-all duration-150 hover:scale-105">

// transform のみ
<div className="transition-transform duration-200 hover:-translate-y-1">

// easing は ease-standard / ease-settle の2種から選ぶ`}
          </pre>
        </section>

        {/* duration */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">Duration（継続時間）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            <code>duration-150</code> をデフォルトとし、ほぼ全てこれを使う。3段以外は使わない。
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <DurationDemo duration="150" />
            <DurationDemo duration="200" />
            <DurationDemo duration="300" />
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            どれを使うかは「その操作が4層のどれか」で決まる。段階の定義・持続（loop）・例外は{' '}
            <a href="?path=/docs/shared-foundations-motion--docs" className="underline">
              Motion 方針
            </a>{' '}
            を参照（この story に表を複製しない）。
          </p>
        </section>

        {/* Easing */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">Easing（イージング）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            2種だけ。実体は <code>tokens/motion.css</code>。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <EasingDemo
              easing="ease-standard"
              label="ease-standard"
              description="その場で変わるもの（色、状態、退出）"
            />
            <EasingDemo
              easing="ease-settle"
              label="ease-settle"
              description="入ってくる・着地するもの"
            />
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            {/* lint-tokens-allow: 「直書きしない」という注意書き自体での言及 */}
            退出も standard を使う。exit 専用の easing は持たない。<code>cubic-bezier</code>{' '}
            をコード側に直書きしない。
          </p>
        </section>

        {/* motion-reduce */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">アクセシビリティ</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            motion-reduce対応で、ユーザー設定に応じてアニメーションを無効化
          </p>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-xs">
            {`// 個別の打ち消しは基本不要。tokens/motion.css の全体規則が
// animation-duration / transition-duration / iteration-count を潰す
*, *::before, *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
}

// 例外は「止めると中途半端な見た目で固まる」もの。
// shimmer は tokens/animations.css が単色へ置換する
.animate-shimmer {
  animation: none !important;
  background: var(--container) !important;
}`}
          </pre>
        </section>
      </div>
    </div>
  ),
};

function AnimationCard({
  name,
  className,
  description,
}: {
  name: string;
  className: string;
  description: string;
}) {
  const [key, setKey] = useState(0);

  const replay = useCallback(() => {
    setKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-2">
      <div
        key={key}
        className={`bg-primary text-primary-foreground flex h-16 items-center justify-center rounded-lg text-sm font-medium ${className} duration-300`}
      >
        {name}
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
      <button type="button" onClick={replay} className="text-primary text-xs hover:underline">
        再生
      </button>
    </div>
  );
}

function ShakeDemo() {
  const [shake, setShake] = useState(false);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  return (
    <div className="flex items-center gap-4">
      <input
        type="text"
        placeholder="エラー入力"
        className={`border-border bg-input rounded-lg border px-4 py-2 ${shake ? 'animate-shake border-destructive' : ''}`}
      />
      <button
        type="button"
        onClick={triggerShake}
        className="text-destructive hover:bg-destructive-state-hover rounded-lg px-4 py-2 text-sm font-medium"
      >
        シェイク
      </button>
    </div>
  );
}

function TransitionDemo({
  name,
  className,
  description,
}: {
  name: string;
  className: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{name}</div>
      <button
        type="button"
        className={`bg-primary text-primary-foreground hover:bg-primary-hover flex h-12 w-full items-center justify-center rounded-lg text-xs font-medium ${className}`}
      >
        hover me
      </button>
      <p className="text-muted-foreground text-xs">{description}</p>
      <code className="text-muted-foreground block text-xs">{className}</code>
    </div>
  );
}

function DurationDemo({ duration }: { duration: string }) {
  const [key, setKey] = useState(0);

  const replay = useCallback(() => {
    setKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-2">
      <div
        key={key}
        className={`bg-primary text-primary-foreground animate-in fade-in zoom-in-95 flex h-12 items-center justify-center rounded-lg text-xs font-medium duration-${duration}`}
      >
        {duration}ms
      </div>
      <button type="button" onClick={replay} className="text-primary text-xs hover:underline">
        再生
      </button>
    </div>
  );
}

function EasingDemo({
  easing,
  label,
  description,
}: {
  easing: string;
  label: string;
  description: string;
}) {
  const [active, setActive] = useState(false);

  const toggle = useCallback(() => {
    setActive((a) => !a);
  }, []);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="bg-muted relative h-12 overflow-hidden rounded-lg">
        <div
          className={`bg-primary absolute top-1 bottom-1 left-1 rounded-lg transition-transform duration-300 ${easing} ${active ? 'translate-x-[calc(100%-3rem)]' : ''}`}
          style={{ width: '2.5rem' }}
        />
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
      <button type="button" onClick={toggle} className="text-primary text-xs hover:underline">
        {active ? 'リセット' : '再生'}
      </button>
    </div>
  );
}

export const Loading: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">ローディングパターン</h1>
      <p className="text-muted-foreground mb-8">スケルトンローダーの実装例</p>

      <div className="grid max-w-5xl gap-8">
        {/* カード */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">カードスケルトン</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border-border space-y-2 rounded-lg border p-4">
              <div className="animate-shimmer h-4 w-3/4 rounded-lg" />
              <div className="animate-shimmer h-3 w-full rounded-lg" />
              <div className="animate-shimmer h-3 w-5/6 rounded-lg" />
            </div>
            <div className="border-border space-y-2 rounded-lg border p-4">
              <div className="animate-shimmer h-32 rounded-lg" />
              <div className="animate-shimmer h-4 w-2/3 rounded-lg" />
              <div className="animate-shimmer h-3 w-full rounded-lg" />
            </div>
          </div>
        </section>

        {/* リスト */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">リストスケルトン</h2>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="animate-shimmer size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="animate-shimmer h-4 w-1/3 rounded-lg" />
                  <div className="animate-shimmer h-3 w-2/3 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* テーブル */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">テーブルスケルトン</h2>
          <div className="space-y-2">
            <div className="border-border flex gap-4 border-b pb-2">
              <div className="animate-shimmer h-4 w-1/4 rounded-lg" />
              <div className="animate-shimmer h-4 w-1/3 rounded-lg" />
              <div className="animate-shimmer h-4 w-1/4 rounded-lg" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 py-2">
                <div className="animate-shimmer h-3 w-1/4 rounded-lg" />
                <div className="animate-shimmer h-3 w-1/3 rounded-lg" />
                <div className="animate-shimmer h-3 w-1/4 rounded-lg" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  ),
};
