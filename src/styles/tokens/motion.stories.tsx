import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useCallback, useState } from 'react';

const meta = {
  title: 'Foundations/Motion',
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
      <h1 className="mb-2 text-2xl font-bold">Motion</h1>
      <p className="text-muted-foreground mb-8">
        アニメーションとトランジションのトークン（Material Design 3準拠）
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* shadcn/ui標準 */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">shadcn/ui標準（animate-in/out）</h2>
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
          <h2 className="mb-4 text-lg font-bold">ローディング（GAFA準拠）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            スケルトンローダー用。shimmerはFacebook/LinkedIn方式。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-bold">animate-shimmer</div>
              <div className="animate-shimmer h-16 rounded-lg" />
              <p className="text-muted-foreground text-xs">左→右の波（推奨）</p>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-bold">animate-pulse</div>
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
          <h2 className="mb-4 text-lg font-bold">エラーフィードバック</h2>
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
          <h2 className="mb-4 text-lg font-bold">Transition（日常インタラクション）</h2>
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

// ease は指定しない（Tailwind デフォルトの ease-in-out で十分）`}
          </pre>
        </section>

        {/* duration */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">Duration（継続時間）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            <code>duration-150</code> をデフォルトとし、ほぼ全てこれを使う。他は例外的な場面のみ。
          </p>
          <div className="grid gap-4 sm:grid-cols-4">
            <DurationDemo duration="75" />
            <DurationDemo duration="150" />
            <DurationDemo duration="200" />
            <DurationDemo duration="300" />
          </div>
          <div className="bg-container mt-4 rounded-lg p-4">
            <h3 className="mb-2 text-sm font-bold">推奨値</h3>
            <ul className="text-muted-foreground space-y-1 text-xs">
              <li>
                <code>duration-75</code> - 即座のフィードバック（active 押下など）
              </li>
              <li>
                <code>duration-150</code> - <strong>標準（デフォルト）</strong> — ほぼ全てこれを使う
              </li>
              <li>
                <code>duration-200</code> - transform、やや重い要素の移動
              </li>
              <li>
                <code>duration-300</code> - 大きな面積の展開・折りたたみ（accordion 等）
              </li>
            </ul>
          </div>
        </section>

        {/* Easing */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">Easing（イージング）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            Material Design 3準拠。要素の動きに自然さを与える。
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <EasingDemo
              easing="ease-out"
              label="ease-out（推奨）"
              description="減速。画面に入る要素に使用"
            />
            <EasingDemo
              easing="ease-in"
              label="ease-in"
              description="加速。画面から出る要素に使用"
            />
            <EasingDemo
              easing="ease-in-out"
              label="ease-in-out"
              description="対称。トグル切り替え等"
            />
            <EasingDemo easing="ease-linear" label="linear" description="等速。プログレスバー等" />
          </div>
          <div className="bg-container mt-4 rounded-lg p-4">
            <h3 className="mb-2 text-sm font-bold">使い分け（Material Design 3）</h3>
            <ul className="text-muted-foreground space-y-1 text-xs">
              <li>
                <code>ease-out</code> - デフォルト。ほとんどの場合これを使う
              </li>
              <li>
                <code>ease-in</code> - 要素が画面外に出るとき
              </li>
              <li>
                <code>ease-in-out</code> - 画面内で位置が変わるとき
              </li>
              <li>
                <code>linear</code> - 継続的な動き（スピナー、プログレス）
              </li>
            </ul>
          </div>
        </section>

        {/* motion-reduce */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">アクセシビリティ</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            motion-reduce対応で、ユーザー設定に応じてアニメーションを無効化
          </p>
          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-xs">
            {`// motion-reduceでアニメーション無効化
className="animate-in fade-in motion-reduce:animate-none"

// reduced-motion.cssで自動適用済み
.animate-in,
.animate-out,
.animate-shimmer {
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
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
        className={`bg-primary text-primary-foreground flex h-16 items-center justify-center rounded-lg text-sm font-bold ${className} duration-300`}
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
        className="text-destructive hover:bg-destructive-state-hover rounded-lg px-4 py-2 text-sm font-bold"
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
      <div className="text-sm font-bold">{name}</div>
      <button
        type="button"
        className={`bg-primary text-primary-foreground hover:bg-primary/80 flex h-12 w-full items-center justify-center rounded-lg text-xs font-bold ${className}`}
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
        className={`bg-primary text-primary-foreground animate-in fade-in zoom-in-95 flex h-12 items-center justify-center rounded-lg text-xs font-bold duration-${duration}`}
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
      <div className="text-sm font-bold">{label}</div>
      <div className="bg-muted relative h-12 overflow-hidden rounded-lg">
        <div
          className={`bg-primary absolute top-1 bottom-1 left-1 rounded-lg transition-transform duration-500 ${easing} ${active ? 'translate-x-[calc(100%-3rem)]' : ''}`}
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
      <h1 className="mb-2 text-2xl font-bold">ローディングパターン</h1>
      <p className="text-muted-foreground mb-8">スケルトンローダーの実装例</p>

      <div className="grid max-w-5xl gap-8">
        {/* カード */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-bold">カードスケルトン</h2>
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
          <h2 className="mb-4 text-lg font-bold">リストスケルトン</h2>
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
          <h2 className="mb-4 text-lg font-bold">テーブルスケルトン</h2>
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
