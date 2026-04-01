import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Foundations/Spacing',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Principles: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Spacing（余白）の原則</h1>
      <p className="text-muted-foreground mb-8">
        要素間の関係性に基づいてSpacingを決定。近いほど関連が強い。
      </p>

      <div className="mb-12 space-y-6">
        <div className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 font-bold">原則: 関係性 = 距離</h2>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li>
              <strong className="text-foreground">近い</strong> → 強く関連（同じグループ）
            </li>
            <li>
              <strong className="text-foreground">遠い</strong> → 弱い関連（異なるグループ）
            </li>
            <li>
              <strong className="text-foreground">内→外</strong> →
              内側は狭く、外側は広く（入れ子の四角形）
            </li>
          </ul>
        </div>
      </div>

      <h2 className="mb-6 text-xl font-bold">関係性の視覚化</h2>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="text-muted-foreground mb-4 text-sm">❌ 一様なSpacing（関係性が不明瞭）</p>
          <div className="bg-container rounded-lg p-4">
            <div className="space-y-4">
              <div className="bg-card rounded-lg p-4">
                <p className="font-bold">タイトル</p>
                <p className="text-muted-foreground text-sm">説明文</p>
              </div>
              <div className="bg-card rounded-lg p-4">
                <p className="font-bold">タイトル</p>
                <p className="text-muted-foreground text-sm">説明文</p>
              </div>
              <div className="bg-card rounded-lg p-4">
                <p className="font-bold">別セクション</p>
                <p className="text-muted-foreground text-sm">説明文</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-4 text-sm">✅ 関係性ベースのSpacing</p>
          <div className="bg-container rounded-lg p-4">
            <div className="space-y-2">
              <div className="bg-card rounded-lg p-4">
                <p className="font-bold">タイトル</p>
                <p className="text-muted-foreground text-sm">説明文</p>
              </div>
              <div className="bg-card rounded-lg p-4">
                <p className="font-bold">タイトル</p>
                <p className="text-muted-foreground text-sm">説明文</p>
              </div>
            </div>
            <div className="mt-6">
              <div className="bg-card rounded-lg p-4">
                <p className="font-bold">別セクション</p>
                <p className="text-muted-foreground text-sm">異なるグループは大きく離す</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Scale: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Spacingスケール（8ptグリッド）</h1>
      <p className="text-muted-foreground mb-8">8pxを基本単位とし、8の倍数のみを使用。</p>

      <div className="space-y-1">
        {[
          { size: '1', px: '4px', name: 'XS', usage: 'アイコンとテキスト間' },
          { size: '2', px: '8px', name: 'S', usage: '標準（同グループ内）', highlight: true },
          { size: '4', px: '16px', name: 'M', usage: '標準（グループ間）', highlight: true },
          { size: '6', px: '24px', name: 'L', usage: 'セクション間', highlight: true },
          { size: '8', px: '32px', name: 'XL', usage: 'ページ余白', highlight: true },
          { size: '12', px: '48px', name: '2XL', usage: '大きなセクション区切り' },
          { size: '16', px: '64px', name: '3XL', usage: 'ページ区切り' },
        ].map(({ size, px, name, usage, highlight }) => (
          <div
            key={size}
            className={`flex items-center gap-4 rounded-lg py-2 ${highlight ? 'bg-muted' : ''}`}
          >
            <div className="w-20 text-right">
              <code className="bg-container rounded px-2 py-1 text-xs">{size}</code>
            </div>
            <div className="text-muted-foreground w-12 text-xs">{px}</div>
            <div className={`w-16 text-sm ${highlight ? 'font-bold' : 'text-muted-foreground'}`}>
              {name}
            </div>
            <div className="bg-container flex-1 overflow-hidden rounded">
              <div className={`bg-primary h-4 w-${size}`} style={{ width: px }} />
            </div>
            <div className="text-muted-foreground w-48 text-xs">{usage}</div>
          </div>
        ))}
      </div>

      <div className="border-info text-info mt-8 rounded-lg border p-4">
        <p className="text-sm">
          <strong>使用する値:</strong> <code className="bg-container rounded px-1">1</code>(4px),{' '}
          <code className="bg-container rounded px-1">2</code>(8px),{' '}
          <code className="bg-container rounded px-1">4</code>(16px),{' '}
          <code className="bg-container rounded px-1">6</code>(24px),{' '}
          <code className="bg-container rounded px-1">8</code>(32px),{' '}
          <code className="bg-container rounded px-1">12</code>(48px),{' '}
          <code className="bg-container rounded px-1">16</code>(64px)
        </p>
      </div>
    </div>
  ),
};

export const ComponentPatterns: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">コンポーネント別パターン</h1>
      <p className="text-muted-foreground mb-8">各UIコンポーネントの推奨Spacing。</p>

      <div className="space-y-12">
        {/* ボタン */}
        <div>
          <h2 className="mb-4 font-bold">ボタン</h2>
          <div className="flex flex-wrap items-start gap-8">
            <div className="text-center">
              <button className="bg-primary text-primary-foreground rounded-lg px-2 py-1 text-sm">
                小ボタン
              </button>
              <p className="text-muted-foreground mt-2 text-xs">
                <code>px-2 py-1</code>
              </p>
            </div>
            <div className="text-center">
              <button className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm">
                標準ボタン
              </button>
              <p className="text-muted-foreground mt-2 text-xs">
                <code>px-4 py-2</code>
              </p>
            </div>
            <div className="text-center">
              <button className="bg-primary text-primary-foreground rounded-lg px-6 py-2">
                大ボタン
              </button>
              <p className="text-muted-foreground mt-2 text-xs">
                <code>px-6 py-2</code>
              </p>
            </div>
          </div>
        </div>

        {/* カード */}
        <div>
          <h2 className="mb-4 font-bold">カード</h2>
          <div className="flex flex-wrap items-start gap-8">
            <div>
              <div className="bg-card border-border w-64 rounded-lg border p-4">
                <p className="font-bold">カードタイトル</p>
                <p className="text-muted-foreground mt-1 text-sm">説明テキスト</p>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                <code>p-4</code> / 内部 <code>gap-1</code>
              </p>
            </div>
            <div>
              <div className="bg-card border-border w-64 rounded-lg border p-6">
                <p className="text-lg font-bold">大きなカード</p>
                <p className="text-muted-foreground mt-2 text-sm">より広い余白</p>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                <code>p-6</code> / 内部 <code>gap-2</code>
              </p>
            </div>
          </div>
        </div>

        {/* リスト */}
        <div>
          <h2 className="mb-4 font-bold">リスト項目</h2>
          <div className="bg-card border-border w-64 rounded-lg border">
            <div className="border-border border-b px-4 py-2">項目1</div>
            <div className="border-border border-b px-4 py-2">項目2</div>
            <div className="px-4 py-2">項目3</div>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            <code>px-4 py-2</code> または <code>px-2 py-2</code>
          </p>
        </div>

        {/* モーダル */}
        <div>
          <h2 className="mb-4 font-bold">モーダル/ダイアログ</h2>
          <div className="bg-card border-border-subtle shadow-card w-80 rounded-2xl border p-6">
            <h3 className="text-lg font-bold">モーダルタイトル</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              モーダルは広めの余白で重要性を強調。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="hover:bg-state-hover rounded-lg px-4 py-2 text-sm">
                キャンセル
              </button>
              <button className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm">
                確認
              </button>
            </div>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            <code>p-6</code> / セクション間 <code>mt-6</code> / ボタン間 <code>gap-2</code>
          </p>
        </div>

        {/* フォーム */}
        <div>
          <h2 className="mb-4 font-bold">フォーム</h2>
          <div className="w-64 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-bold">ラベル</label>
              <input
                type="text"
                className="bg-input border-border w-full rounded-lg border px-4 py-2"
                placeholder="入力..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold">ラベル</label>
              <input
                type="text"
                className="bg-input border-border w-full rounded-lg border px-4 py-2"
                placeholder="入力..."
              />
            </div>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            ラベル-入力間 <code>gap-1</code> / フィールド間 <code>gap-4</code>
          </p>
        </div>
      </div>
    </div>
  ),
};

export const GapUsage: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Gap（要素間の余白）</h1>
      <p className="text-muted-foreground mb-8">Flexbox/Gridでの要素間余白。関係性に応じて選択。</p>

      <div className="space-y-8">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <code className="bg-container rounded px-2 py-1 text-xs">gap-1</code>
            <span className="text-muted-foreground text-sm">タイト（アイコン+テキスト）</span>
          </div>
          <div className="bg-card border-border inline-flex items-center gap-1 rounded-lg border px-4 py-2">
            <div className="bg-primary size-4 rounded" />
            <span className="text-sm">ラベル</span>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <code className="bg-container rounded px-2 py-1 text-xs">gap-2</code>
            <span className="text-muted-foreground text-sm">標準（同グループ内）</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-primary size-8 rounded-lg" />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <code className="bg-container rounded px-2 py-1 text-xs">gap-4</code>
            <span className="text-muted-foreground text-sm">標準（グループ間、カード並び）</span>
          </div>
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border-border size-16 rounded-lg border" />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <code className="bg-container rounded px-2 py-1 text-xs">gap-6</code>
            <span className="text-muted-foreground text-sm">広め（セクション間）</span>
          </div>
          <div className="flex gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border-border h-16 w-24 rounded-lg border" />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <code className="bg-container rounded px-2 py-1 text-xs">gap-8</code>
            <span className="text-muted-foreground text-sm">大きく離す（独立セクション）</span>
          </div>
          <div className="flex gap-8">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card border-border h-16 w-32 rounded-lg border" />
            ))}
          </div>
        </div>
      </div>
    </div>
  ),
};

export const NestedSpacing: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">入れ子のSpacing</h1>
      <p className="text-muted-foreground mb-8">
        内側→外側に向かってSpacingを大きくする。入れ子の四角形として考える。
      </p>

      <div className="bg-container rounded-2xl p-8">
        <p className="text-muted-foreground mb-2 text-xs">外側: p-8 (32px)</p>

        <div className="space-y-6">
          <div className="bg-card rounded-lg p-6">
            <p className="text-muted-foreground mb-2 text-xs">
              中間: p-6 (24px) / セクション間: gap-6
            </p>

            <div className="space-y-4">
              <div className="bg-container rounded-lg p-4">
                <p className="text-muted-foreground mb-2 text-xs">
                  内側: p-4 (16px) / 項目間: gap-4
                </p>

                <div className="flex gap-2">
                  <div className="bg-primary-state-selected rounded p-2 text-xs">要素</div>
                  <div className="bg-primary-state-selected rounded p-2 text-xs">要素</div>
                  <div className="bg-primary-state-selected rounded p-2 text-xs">要素</div>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">最内側: p-2, gap-2 (8px)</p>
              </div>

              <div className="bg-container rounded-lg p-4">
                <div className="flex gap-2">
                  <div className="bg-primary-state-selected rounded p-2 text-xs">要素</div>
                  <div className="bg-primary-state-selected rounded p-2 text-xs">要素</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg p-6">
            <p className="font-bold">別セクション</p>
            <p className="text-muted-foreground mt-2 text-sm">セクション間は大きく離す (gap-6)</p>
          </div>
        </div>
      </div>

      <div className="border-info text-info mt-8 rounded-lg border p-4">
        <p className="text-sm">
          <strong>ルール:</strong> 内側のSpacingは外側より小さく。
          <br />
          最内側 (8px) → 内側 (16px) → 中間 (24px) → 外側 (32px)
        </p>
      </div>
    </div>
  ),
};

export const BorderIndicator: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Border Indicator</h1>
      <p className="text-muted-foreground mb-8">
        カレンダーエントリの左端アクセント線。3px幅のデザイントークン。
      </p>

      <div className="space-y-6">
        <div>
          <h2 className="mb-4 font-bold">
            Utility: <code className="text-muted-foreground text-xs">border-l-indicator</code>
          </h2>
          <div className="space-y-4">
            <div className="bg-tag-blue-tint border-tag-blue border-l-indicator flex h-10 items-center rounded-lg px-2">
              <span className="text-foreground text-xs font-medium tabular-nums">
                10:00–11:00 ミーティング
              </span>
            </div>
            <div className="bg-tag-green-tint border-tag-green border-l-indicator flex h-10 items-center rounded-lg px-2">
              <span className="text-foreground text-xs font-medium tabular-nums">
                14:00–15:00 コーディング
              </span>
            </div>
            <div className="bg-tag-amber-tint border-tag-amber border-l-indicator flex h-10 items-center rounded-lg px-2">
              <span className="text-foreground text-xs font-medium tabular-nums">
                16:00–17:00 レビュー
              </span>
            </div>
          </div>
        </div>

        <div className="border-info text-info rounded-lg border p-4">
          <p className="text-sm">
            <strong>CSS変数:</strong> <code className="text-xs">--border-indicator: 3px</code>
            <br />
            3pxは8pxグリッド外だが、視覚的アクセントとして意図的に定義。
          </p>
        </div>
      </div>
    </div>
  ),
};

export const QuickReference: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-bold">クイックリファレンス</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-bold">Gap（要素間）</h2>
          <table className="w-full text-sm">
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2">
                  <code className="text-xs">gap-1</code>
                </td>
                <td className="text-muted-foreground py-2">アイコン+テキスト</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">gap-2</code>
                </td>
                <td className="text-muted-foreground py-2">同グループ内（ボタン群など）</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">gap-4</code>
                </td>
                <td className="text-muted-foreground py-2">グループ間、フォームフィールド</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">gap-6</code>
                </td>
                <td className="text-muted-foreground py-2">セクション間</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">gap-8</code>
                </td>
                <td className="text-muted-foreground py-2">大きなセクション区切り</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-bold">Padding（内側余白）</h2>
          <table className="w-full text-sm">
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2">
                  <code className="text-xs">p-1</code>
                </td>
                <td className="text-muted-foreground py-2">メニュー項目、小要素</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">p-2</code>
                </td>
                <td className="text-muted-foreground py-2">リスト項目、タグ</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">p-4</code>
                </td>
                <td className="text-muted-foreground py-2">カード、ポップオーバー</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">p-6</code>
                </td>
                <td className="text-muted-foreground py-2">モーダル、大きなカード</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">p-8</code>
                </td>
                <td className="text-muted-foreground py-2">ページコンテナ</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-bold">ボタンのPadding</h2>
          <table className="w-full text-sm">
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2">
                  <code className="text-xs">px-2 py-1</code>
                </td>
                <td className="text-muted-foreground py-2">Small</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">px-4 py-2</code>
                </td>
                <td className="text-muted-foreground py-2">Default（標準）</td>
              </tr>
              <tr>
                <td className="py-2">
                  <code className="text-xs">px-6 py-2</code>
                </td>
                <td className="text-muted-foreground py-2">Large</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-bold">避けるべきパターン</h2>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-destructive">✗</span>
              <span>一様なSpacing（関係性が伝わらない）</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive">✗</span>
              <span>内側 {'>'} 外側のSpacing</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive">✗</span>
              <span>
                任意値 <code className="text-xs">p-[13px]</code>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive">✗</span>
              <span>
                スケール外 <code className="text-xs">0.5, 1.5, 3, 5, 7</code>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  ),
};
