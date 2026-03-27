import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Foundations/Elevation',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => {
    const levels = [
      {
        level: 'Sunken',
        surface: 'bg-container / bg-muted',
        shadow: 'none',
        border: 'border-border',
        usage: 'sidebar, footer, input, well',
        lightL: '0.96 / 0.95',
        darkL: '0.15 / 0.25',
      },
      {
        level: 'Base',
        surface: 'bg-background',
        shadow: 'none',
        border: '—',
        usage: 'ページ地',
        lightL: '0.98',
        darkL: '0.18',
      },
      {
        level: 'Raised',
        surface: 'bg-card',
        shadow: 'shadow-sm',
        border: 'border-border-subtle',
        usage: 'カード, セクション',
        lightL: '1.00',
        darkL: '0.22',
      },
      {
        level: 'Overlay',
        surface: 'bg-card',
        shadow: 'shadow-card',
        border: 'border-border-subtle',
        usage: 'dropdown, popover, dialog',
        lightL: '1.00',
        darkL: '0.22',
      },
    ] as const;

    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">Elevation（高さ）</h1>
        <p className="text-muted-foreground mb-2 text-sm">
          UI 要素の z 軸上の位置。surface色 + shadow + border のセットで表現する。
        </p>
        <p className="text-muted-foreground mb-8 text-sm">shadow 単体ではなく、3つの組み合わせ。</p>

        {/* ── 設計原則 ── */}
        <div className="bg-card border-border mb-8 rounded-xl border p-6">
          <h2 className="mb-3 text-lg font-bold">設計原則</h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-bold">Light:</span>{' '}
              <span className="text-muted-foreground">shadow が奥行きの主役。面色差は補助。</span>
            </p>
            <p>
              <span className="font-bold">Dark:</span>{' '}
              <span className="text-muted-foreground">面色差が主役。shadow は補助。</span>
            </p>
            <p className="text-muted-foreground mt-3 text-xs">
              この逆転が elevation 設計の核心。Light と Dark で「浮いて見える」仕組みが違う。
            </p>
          </div>
        </div>

        {/* ── 4段階ライブプレビュー ── */}
        <h3 className="mb-3 font-bold">4段階プレビュー</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Storybook ツールバーの 🌙 で切り替えると Light/Dark の見え方の違いが確認できます。
        </p>
        <div className="bg-background border-border mb-8 grid grid-cols-4 gap-6 rounded-xl border p-6">
          {/* Sunken */}
          <div className="text-center">
            <div className="bg-container border-border flex h-24 items-center justify-center rounded-lg border">
              <span className="text-muted-foreground text-xs">Sunken</span>
            </div>
            <p className="mt-2 text-xs font-bold">Sunken</p>
            <p className="text-muted-foreground text-xs">no shadow</p>
          </div>
          {/* Base */}
          <div className="text-center">
            <div className="bg-background flex h-24 items-center justify-center rounded-lg">
              <span className="text-muted-foreground text-xs">Base</span>
            </div>
            <p className="mt-2 text-xs font-bold">Base</p>
            <p className="text-muted-foreground text-xs">no shadow</p>
          </div>
          {/* Raised */}
          <div className="text-center">
            <div
              className="bg-card border-border-subtle flex h-24 items-center justify-center rounded-lg border"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              <span className="text-muted-foreground text-xs">Raised</span>
            </div>
            <p className="mt-2 text-xs font-bold">Raised</p>
            <p className="text-muted-foreground text-xs">shadow-sm</p>
          </div>
          {/* Overlay */}
          <div className="text-center">
            <div
              className="bg-card border-border-subtle flex h-24 items-center justify-center rounded-lg border"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <span className="text-muted-foreground text-xs">Overlay</span>
            </div>
            <p className="mt-2 text-xs font-bold">Overlay</p>
            <p className="text-muted-foreground text-xs">shadow-card</p>
          </div>
        </div>

        {/* ── Spec テーブル ── */}
        <h3 className="mb-3 font-bold">Elevation レベル</h3>
        <div className="bg-card border-border mb-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-3 text-left text-xs font-bold">Level</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Surface</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Shadow</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Border</th>
                <th className="px-4 py-3 text-left text-xs font-bold">用途</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {levels.map(({ level, surface, shadow, border, usage }) => (
                <tr key={level} className="border-border border-b">
                  <td className="text-foreground px-4 py-2 text-xs font-bold">{level}</td>
                  <td className="px-4 py-2 font-mono text-xs">{surface}</td>
                  <td className="px-4 py-2 font-mono text-xs">{shadow}</td>
                  <td className="px-4 py-2 font-mono text-xs">{border}</td>
                  <td className="px-4 py-2 text-xs">{usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Dark mode 比較 ── */}
        <h3 className="mb-3 font-bold">Dark mode での見え方</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Light では shadow で区別。Dark では面色差(L値)で区別。
        </p>
        <div className="bg-card border-border mb-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="px-4 py-3 text-left text-xs font-bold">Level</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Light L</th>
                <th className="px-4 py-3 text-left text-xs font-bold">Dark L</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {levels.map(({ level, lightL, darkL }) => (
                <tr key={level} className="border-border border-b">
                  <td className="text-foreground px-4 py-2 text-xs font-bold">{level}</td>
                  <td className="px-4 py-2 font-mono text-xs">{lightL}</td>
                  <td className="px-4 py-2 font-mono text-xs">{darkL}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mb-8 text-xs">
          Dark の Raised と Overlay は同じ surface 色(L=0.22)。違いは shadow の強さと z-index。
        </p>

        {/* ── なぜ4段階か ── */}
        <h3 className="mb-3 font-bold">なぜ 6段階 → 4段階か</h3>
        <div className="bg-card border-border mb-6 rounded-xl border p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <p className="text-destructive text-sm font-bold">旧: 6段階</p>
              <p className="text-muted-foreground text-xs">
                shadow-none / xs / sm / md / lg / xl
                <br />
                「この dropdown は shadow-lg? shadow-xl?」と毎回迷う
              </p>
            </div>
            <div className="border-success space-y-2 border-l-4 pl-4">
              <p className="text-success text-sm font-bold">新: 4段階</p>
              <p className="text-muted-foreground text-xs">
                背景に沈むか？→ Sunken
                <br />
                地面か？→ Base
                <br />
                浮くか？→ Raised
                <br />
                最前面か？→ Overlay
              </p>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            Color の Surface トークンと 1:1 で対応するので覚えることが増えない。
          </p>
        </div>

        {/* ── z-index ── */}
        <h3 className="mb-3 font-bold">z-index</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Sunken / Base / Raised → z-index 指定なし。Overlay のみ z-index 必須。
        </p>
        <div className="bg-card border-border rounded-xl border p-6">
          <p className="text-muted-foreground text-sm">
            Overlay の中でも dropdown(z-50) と modal(z-200) は見た目は同じ shadow-card
            だが、スタッキング順序が違う。
          </p>
        </div>
      </div>
    );
  },
};

export const UseCases: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-bold">実装例</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        各 elevation レベルの実装パターン。クラスをそのままコピペ可能。
      </p>

      <div className="space-y-10">
        {/* Sunken: サイドバー */}
        <section>
          <h2 className="mb-1 text-lg font-bold">Sunken: サイドバー</h2>
          <code className="text-muted-foreground mb-3 block text-xs">
            bg-container border-r border-border
          </code>
          <div
            className="bg-background border-border grid overflow-hidden rounded-xl border"
            style={{ gridTemplateColumns: '200px 1fr', height: 160 }}
          >
            <aside
              className="bg-container flex flex-col gap-2 border-r p-4"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="bg-foreground h-2 w-3/4 rounded opacity-20" />
              <div className="bg-foreground h-2 w-1/2 rounded opacity-20" />
              <div className="bg-foreground h-2 w-2/3 rounded opacity-20" />
            </aside>
            <div className="p-4">
              <div className="bg-foreground h-2 w-1/2 rounded opacity-10" />
            </div>
          </div>
        </section>

        {/* Sunken: Input */}
        <section>
          <h2 className="mb-1 text-lg font-bold">Sunken: 入力フィールド</h2>
          <code className="text-muted-foreground mb-3 block text-xs">bg-muted rounded-lg</code>
          <div className="bg-card border-border rounded-xl border p-6">
            <div className="bg-muted w-64 rounded-lg px-4 py-2">
              <span className="text-muted-foreground text-sm">テキストを入力...</span>
            </div>
          </div>
        </section>

        {/* Raised: カード */}
        <section>
          <h2 className="mb-1 text-lg font-bold">Raised: カード</h2>
          <code className="text-muted-foreground mb-3 block text-xs">
            bg-card border border-border-subtle rounded-lg shadow-sm
          </code>
          <div className="bg-background rounded-xl p-6">
            <div
              className="bg-card border-border-subtle w-80 rounded-lg border p-6"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              <h3 className="mb-2 font-bold">カードタイトル</h3>
              <p className="text-muted-foreground text-sm">コンテンツをグループ化</p>
            </div>
          </div>
        </section>

        {/* Overlay: ドロップダウン */}
        <section>
          <h2 className="mb-1 text-lg font-bold">Overlay: ドロップダウン</h2>
          <code className="text-muted-foreground mb-3 block text-xs">
            bg-card border border-border-subtle rounded-lg shadow-card z-50
          </code>
          <div className="bg-background rounded-xl p-6">
            <div
              className="bg-card border-border-subtle w-48 rounded-lg border p-2"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="hover:bg-state-hover rounded px-4 py-2 text-sm">メニュー 1</div>
              <div className="hover:bg-state-hover rounded px-4 py-2 text-sm">メニュー 2</div>
              <div className="hover:bg-state-hover rounded px-4 py-2 text-sm">メニュー 3</div>
            </div>
          </div>
        </section>

        {/* Overlay: モーダル */}
        <section>
          <h2 className="mb-1 text-lg font-bold">Overlay: モーダル</h2>
          <code className="text-muted-foreground mb-3 block text-xs">
            bg-overlay（scrim） + bg-card shadow-card rounded-2xl z-50
          </code>
          <div className="relative overflow-hidden rounded-xl" style={{ height: 220 }}>
            {/* 背景コンテンツ */}
            <div className="bg-background absolute inset-0 p-6">
              <div className="bg-foreground h-2 w-1/3 rounded opacity-10" />
              <div className="bg-foreground mt-2 h-2 w-1/4 rounded opacity-10" />
            </div>
            {/* Scrim */}
            <div className="bg-overlay absolute inset-0" />
            {/* Dialog */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="bg-card border-border-subtle w-72 rounded-2xl border p-6"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <h3 className="mb-2 text-lg font-bold">モーダルタイトル</h3>
                <p className="text-muted-foreground mb-4 text-sm">最前面でユーザーの操作を待つ</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="hover:bg-state-hover rounded-lg px-4 py-2 text-sm"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm"
                  >
                    確認
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
};
