import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Foundations',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function StepCard({
  step,
  title,
  description,
  href,
  linkLabel,
}: {
  step: number;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="bg-card border-border rounded-xl border p-4">
      <div className="text-muted-foreground mb-1 text-xs font-bold">Step {step}</div>
      <h3 className="mb-2 font-bold">{title}</h3>
      <p className="text-muted-foreground mb-2 text-sm">{description}</p>
      <a href={href} className="text-primary text-sm underline">
        {linkLabel} →
      </a>
    </div>
  );
}

export const DesignSystem: Story = {
  render: () => {
    const examples = [
      {
        title: 'サイドバーを作りたい',
        steps: [
          'Step 1: 裏方 → bg-container',
          'Step 2: Sunken（shadow なし、border-border で区切り）',
          '終わり。色不要。',
        ],
      },
      {
        title: 'カードを作りたい',
        steps: [
          'Step 1: 注目 → bg-card',
          'Step 2: Raised → shadow-sm + border-border-subtle',
          '終わり。色不要。',
        ],
      },
      {
        title: 'エラーバナーを作りたい',
        steps: [
          'Step 1: 注目 → bg-card',
          'Step 2: Raised → shadow-sm',
          'Step 3: destructive → bg-destructive-tint + text-destructive + アイコン併用',
        ],
      },
      {
        title: 'ドロップダウンを作りたい',
        steps: [
          'Step 1: 注目 → bg-card',
          'Step 2: Overlay → shadow-card + border-border-subtle',
          'Z-Index: z-dropdown (50)',
          'Step 4: hover → hover:bg-state-hover',
        ],
      },
      {
        title: '成功バッジを作りたい',
        steps: [
          'Step 3: success → border-success text-success',
          'アイコン併用（色だけで伝えない）',
        ],
      },
    ] as const;

    const doRules = [
      'トークン経由で色を使う。oklch の値を直接書かない',
      '9割のUIは neutral で終わる。色は意味があるときだけ',
      '薄い色を広い面に、強い色を小さい要素に',
      '色だけで情報を伝えない。アイコン + テキストを併用',
      'Surface 階層を守る: container(沈む) → background → card(浮く)',
    ] as const;

    const dontRules = [
      'bg-red-500 text-white のような直接指定',
      '意味なく画面をカラフルにする',
      'accent 色をセクション全体の背景に使う',
      'dark:bg-[oklch(...)] と値を直接書く',
      'z-[200] のような任意値',
    ] as const;

    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">Design System Overview</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          新しいコンポーネントを作るとき、このページから始める。各ページへの判断フローと、設計の全体像。
        </p>

        {/* ── 設計の核心 ── */}
        <div className="bg-card border-border mb-8 rounded-xl border p-6">
          <h2 className="mb-4 text-lg font-bold">設計の核心</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            oklch(L C H) の3軸がそれぞれ1つの役割を持つ。
          </p>
          <div className="mb-4 space-y-1 font-mono text-sm">
            <div>
              <span className="text-muted-foreground">L軸</span> = 空間（浮く/沈む）
            </div>
            <div>
              <span className="text-muted-foreground">H軸</span> = 意味（blue=action, amber=warning,
              green=success, red=error）
            </div>
            <div>
              <span className="text-muted-foreground">C軸</span> = 強度（tint=薄い, accent=強い）
            </div>
          </div>
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              <span className="text-foreground font-bold">Dark mode:</span> Surface — warm H60
              C0.008。テキストはオフホワイト L0.90。Shadow — 面色差が主役、shadow は補助。Border —
              alpha-based（black/α, white/α）
            </p>
          </div>
        </div>

        {/* ── 判断フロー ── */}
        <h2 className="mb-4 text-lg font-bold">コンポーネントを作るときの判断フロー</h2>
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <StepCard
            step={1}
            title="この面はどこにいる？"
            description="container / background / card / muted の4択。「ユーザーの目がここに行くべきか？」で決まる。9割のUIはこの判断だけで完結する。"
            href="?path=/story/foundations-colors--surface"
            linkLabel="Colors > Surface"
          />
          <StepCard
            step={2}
            title="どう浮かせる？"
            description="Step 1 で card を選んだら、shadow と border をセットで決める。Sunken / Base / Raised / Overlay の4段階。"
            href="?path=/story/foundations-elevation--overview"
            linkLabel="Elevation"
          />
          <StepCard
            step={3}
            title="色で意味を伝える必要がある？"
            description="No → neutral のまま。ここで終わり。Yes → destructive / warning / success / info。強度を選ぶ: tint / accent。"
            href="?path=/story/foundations-colors--semantic"
            linkLabel="Colors > Semantic"
          />
          <StepCard
            step={4}
            title="インタラクション状態は？"
            description="hover / focus / pressed / active のパターンを選ぶ。コピペ用クラスはここにある。"
            href="?path=/story/foundations-states--overview"
            linkLabel="States"
          />
        </div>

        {/* ── ページ一覧 ── */}
        <h2 className="mb-4 text-lg font-bold">ページ一覧と役割</h2>
        <div className="mb-8 space-y-6">
          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-bold tracking-widest uppercase">
              見た目を決める（Step 1-3）
            </h3>
            <div className="bg-card border-border overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <tbody className="text-muted-foreground">
                  <tr className="border-border border-b">
                    <td className="text-foreground px-4 py-2 font-bold">
                      <a
                        href="?path=/story/foundations-colors--all-colors"
                        className="text-primary underline"
                      >
                        Colors
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      何色か。Surface / Text / Semantic のトークン定義
                    </td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="text-foreground px-4 py-2 font-bold">
                      <a
                        href="?path=/story/foundations-elevation--overview"
                        className="text-primary underline"
                      >
                        Elevation
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      どう浮くか。surface色 + shadow + border のセット
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-bold tracking-widest uppercase">
              振る舞いを決める（Step 4）
            </h3>
            <div className="bg-card border-border overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <tbody className="text-muted-foreground">
                  <tr className="border-border border-b">
                    <td className="text-foreground px-4 py-2 font-bold">
                      <a
                        href="?path=/story/foundations-states--overview"
                        className="text-primary underline"
                      >
                        States
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      どう動くか。hover / focus のデモと実装パターン
                    </td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="text-foreground px-4 py-2 font-bold">
                      <a
                        href="?path=/story/foundations-zindex--all-layers"
                        className="text-primary underline"
                      >
                        Z-Index
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs">重なり順。Overlay レベルの要素だけが使う</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-bold tracking-widest uppercase">
              基盤
            </h3>
            <div className="bg-card border-border overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <tbody className="text-muted-foreground">
                  {[
                    {
                      name: 'Typography',
                      href: '?path=/docs/foundations-typography--docs',
                      desc: '書体、サイズ、行間、ウェイト',
                    },
                    {
                      name: 'Spacing',
                      href: '?path=/docs/foundations-spacing--docs',
                      desc: '余白。8pt グリッド。関係性が近いほど狭く',
                    },
                    {
                      name: 'Radius',
                      href: '?path=/docs/foundations-radius--docs',
                      desc: '角丸。コンポーネントサイズに応じて選択',
                    },
                    {
                      name: 'Icons',
                      href: '?path=/story/foundations-icons--overview',
                      desc: 'アイコンセット、サイズ規定',
                    },
                    {
                      name: 'Motion',
                      href: '?path=/docs/foundations-motion--docs',
                      desc: 'アニメーション、トランジション',
                    },
                    {
                      name: 'Responsive',
                      href: '?path=/docs/foundations-responsive--docs',
                      desc: 'ブレークポイント、レスポンシブ設計',
                    },
                  ].map(({ name, href, desc }) => (
                    <tr key={name} className="border-border border-b">
                      <td className="text-foreground px-4 py-2 font-bold">
                        <a href={href} className="text-primary underline">
                          {name}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-xs">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── よくある判断の例 ── */}
        <h2 className="mb-4 text-lg font-bold">よくある判断の例</h2>
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {examples.map(({ title, steps }) => (
            <div key={title} className="bg-card border-border rounded-xl border p-4">
              <h3 className="mb-2 text-sm font-bold">{title}</h3>
              <ul className="space-y-1">
                {steps.map((step) => (
                  <li key={step} className="text-muted-foreground text-xs">
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Do's & Don'ts ── */}
        <h2 className="mb-4 text-lg font-bold">Do&apos;s &amp; Don&apos;ts（全体）</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="border-success space-y-2 border-l-4 pl-4">
            <p className="text-success text-sm font-bold">Do</p>
            <ul className="space-y-1">
              {doRules.map((rule) => (
                <li key={rule} className="text-muted-foreground text-xs">
                  {rule}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-destructive space-y-2 border-l-4 pl-4">
            <p className="text-destructive text-sm font-bold">Don&apos;t</p>
            <ul className="space-y-1">
              {dontRules.map((rule) => (
                <li key={rule} className="text-muted-foreground text-xs">
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          詳細な Do&apos;s &amp; Don&apos;ts は →{' '}
          <a href="?path=/story/foundations-colors--dos-donts" className="text-primary underline">
            Colors ページ末尾
          </a>
          を参照。
        </p>
      </div>
    );
  },
};
