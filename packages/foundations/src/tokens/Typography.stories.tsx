import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Shared/Foundations/Typography',
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
      <h1 className="mb-6 text-2xl font-medium">Typography原則</h1>

      <div className="space-y-6">
        <div className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 font-medium">Tailwindデフォルトを使用</h2>
          <p className="text-muted-foreground text-sm">
            フォントサイズはTailwindのデフォルトスケールをそのまま使用。
            業界標準で学習コストゼロ、ドキュメントも豊富。
          </p>
        </div>

        <div className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 font-medium">視覚的階層を作る</h2>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li>• サイズの差で重要度を表現（大きい = 重要）</li>
            <li>• ウェイトで強調（bold = 見出し、normal = 本文）</li>
            <li>• 色で階層（foreground = 主要、muted = 補助）</li>
          </ul>
        </div>

        <div className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 font-medium">フォント</h2>
          <p className="text-muted-foreground text-sm">
            Inter（英語）+ Noto Sans JP（日本語）。 next/fontで最適化済み。
          </p>
        </div>
      </div>
    </div>
  ),
};

export const Scale: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-medium">フォントサイズスケール</h1>
      <p className="text-muted-foreground mb-8">Tailwindデフォルト。よく使うサイズをハイライト。</p>

      <div className="space-y-1">
        {[
          { class: 'text-xs', px: '12px', usage: 'タイムスタンプ、注釈', highlight: true },
          { class: 'text-sm', px: '14px', usage: 'UIテキスト、ボタン、ラベル', highlight: true },
          { class: 'text-base', px: '16px', usage: '本文（デフォルト）', highlight: true },
          { class: 'text-lg', px: '18px', usage: '小見出し' },
          { class: 'text-xl', px: '20px', usage: 'カード見出し' },
          { class: 'text-2xl', px: '24px', usage: 'セクション見出し', highlight: true },
          { class: 'text-3xl', px: '30px', usage: 'ページタイトル' },
          { class: 'text-4xl', px: '36px', usage: 'ヒーロー' },
        ].map(({ class: cls, px, usage, highlight }) => (
          <div
            key={cls}
            className={`flex items-center gap-4 rounded-lg p-2 ${highlight ? 'bg-state-active' : ''}`}
          >
            <code className="bg-container w-24 rounded-lg px-2 py-1 text-center text-xs">
              {cls}
            </code>
            <div className="text-muted-foreground w-16 text-xs">{px}</div>
            <div className={`flex-1 ${cls}`}>あいうえお ABC</div>
            <div className="text-muted-foreground w-48 text-xs">{usage}</div>
          </div>
        ))}
      </div>

      <div className="border-info text-info mt-8 rounded-lg border p-4">
        <p className="text-sm">
          <strong>よく使う:</strong> <code className="bg-container rounded-lg px-1">text-xs</code>,{' '}
          <code className="bg-container rounded-lg px-1">text-sm</code>,{' '}
          <code className="bg-container rounded-lg px-1">text-base</code>,{' '}
          <code className="bg-container rounded-lg px-1">text-2xl</code>
        </p>
      </div>
    </div>
  ),
};

export const Hierarchy: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-medium">タイポグラフィ階層</h1>
      <p className="text-muted-foreground mb-8">UIで使う典型的なパターン。</p>

      <div className="space-y-8">
        {/* ページレベル */}
        <div className="border-border border-b pb-6">
          <div className="text-muted-foreground mb-2 text-xs">ページタイトル</div>
          <h1 className="text-2xl font-medium">設定</h1>
          <p className="text-muted-foreground mt-1 text-sm">アカウントとアプリの設定を管理</p>
          <code className="bg-container mt-2 inline-block rounded-lg px-2 py-1 text-xs">
            text-2xl font-medium + text-sm text-muted-foreground
          </code>
        </div>

        {/* セクション */}
        <div className="border-border border-b pb-6">
          <div className="text-muted-foreground mb-2 text-xs">セクション見出し</div>
          <h2 className="text-lg font-medium">プロフィール</h2>
          <code className="bg-container mt-2 inline-block rounded-lg px-2 py-1 text-xs">
            text-lg font-medium
          </code>
        </div>

        {/* カード */}
        <div className="border-border border-b pb-6">
          <div className="text-muted-foreground mb-2 text-xs">カード見出し</div>
          <h3 className="font-medium">メール通知</h3>
          <p className="text-muted-foreground mt-1 text-sm">重要な更新をメールで受け取る</p>
          <code className="bg-container mt-2 inline-block rounded-lg px-2 py-1 text-xs">
            font-medium + text-sm text-muted-foreground
          </code>
        </div>

        {/* ラベル */}
        <div className="border-border border-b pb-6">
          <div className="text-muted-foreground mb-2 text-xs">フォームラベル</div>
          <label className="text-sm font-medium">メールアドレス</label>
          <code className="bg-container mt-2 inline-block rounded-lg px-2 py-1 text-xs">
            text-sm font-medium
          </code>
        </div>

        {/* 補助テキスト */}
        <div>
          <div className="text-muted-foreground mb-2 text-xs">補助テキスト</div>
          <p className="text-muted-foreground text-xs">最終更新: 2024年1月1日</p>
          <code className="bg-container mt-2 inline-block rounded-lg px-2 py-1 text-xs">
            text-xs text-muted-foreground
          </code>
        </div>
      </div>
    </div>
  ),
};

export const Weight: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-medium">フォントウェイト</h1>
      <p className="text-muted-foreground mb-8">2つだけ。シンプルに保つ。</p>

      <div className="space-y-6">
        <div className="bg-card border-border rounded-lg border p-6">
          <div className="mb-4">
            <code className="bg-container rounded-lg px-2 py-1 text-xs">font-medium</code>
          </div>
          <p className="text-xl font-medium">見出し、強調</p>
          <p className="text-muted-foreground mt-2 text-sm">
            ページタイトル、セクション見出し、ラベル、重要な情報
          </p>
        </div>

        <div className="bg-card border-border rounded-lg border p-6">
          <div className="mb-4">
            <code className="bg-container rounded-lg px-2 py-1 text-xs">font-normal</code>
          </div>
          <p className="font-normal">本文テキスト（デフォルト）</p>
          <p className="text-muted-foreground mt-2 text-sm">段落、説明文、UIテキスト全般</p>
        </div>
      </div>
    </div>
  ),
};

export const QuickReference: Story = {
  render: () => (
    <div>
      <h1 className="mb-6 text-2xl font-medium">クイックリファレンス</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-medium">見出し</h2>
          <table className="w-full text-sm">
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2">ページタイトル</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">text-2xl font-medium</code>
                </td>
              </tr>
              <tr>
                <td className="py-2">セクション</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">text-lg font-medium</code>
                </td>
              </tr>
              <tr>
                <td className="py-2">カード見出し</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">font-medium</code>
                </td>
              </tr>
              <tr>
                <td className="py-2">ラベル</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">text-sm font-medium</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-medium">本文</h2>
          <table className="w-full text-sm">
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2">標準</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">text-base</code>（16px）
                </td>
              </tr>
              <tr>
                <td className="py-2">UI・ボタン</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">text-sm</code>（14px）
                </td>
              </tr>
              <tr>
                <td className="py-2">補助</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">text-xs text-muted-foreground</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-medium">行間</h2>
          <table className="w-full text-sm">
            <tbody className="divide-border divide-y">
              <tr>
                <td className="py-2">見出し</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">leading-tight</code>（1.25）
                </td>
              </tr>
              <tr>
                <td className="py-2">本文</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">leading-normal</code>（1.5）
                </td>
              </tr>
              <tr>
                <td className="py-2">長文</td>
                <td className="text-muted-foreground py-2">
                  <code className="text-xs">leading-relaxed</code>（1.625）
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-card border-border rounded-lg border p-4">
          <h2 className="mb-4 font-medium">避けるべきパターン</h2>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-destructive">✗</span>
              <span>ウェイトの多用（3種類以上）</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive">✗</span>
              <span>サイズの飛びすぎ（xs→2xl）</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive">✗</span>
              <span>
                任意値 <code className="text-xs">{`text-[${'17px'}]`}</code>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  ),
};

export const DosDonts: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">Do&apos;s & Don&apos;ts</h1>
      <p className="text-muted-foreground mb-8">タイポグラフィのベストプラクティス。</p>

      <div className="grid max-w-5xl gap-8">
        {/* Tailwindスケール */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">Tailwindデフォルトスケールを使用</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="text-success font-medium">Do</h3>
              <div className="space-y-2">
                <p className="text-2xl font-medium">text-2xl（見出し）</p>
                <p className="text-base">text-base（本文）</p>
                <p className="text-muted-foreground text-sm">text-sm（補助）</p>
              </div>
              <code className="text-muted-foreground block text-xs">
                text-2xl, text-base, text-sm
              </code>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="text-destructive font-medium">Don&apos;t</h3>
              <div className="space-y-2">
                <p className="font-medium" style={{ fontSize: '23px' }}>
                  {`text-[${'23px'}]`}（任意値）
                </p>
                <p style={{ fontSize: '15px' }}>{`text-[${'15px'}]`}（任意値）</p>
                <p className="text-muted-foreground" style={{ fontSize: '11px' }}>
                  {`text-[${'11px'}]`}（任意値）
                </p>
              </div>
              <code className="text-muted-foreground block text-xs">
                {`text-[${'23px'}]`}（任意値は禁止）
              </code>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由: 業界標準のスケールで一貫性を保ち、デザインの統一感を維持。
          </p>
        </section>

        {/* 階層的なサイズ */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">階層的なサイズ変化</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="text-success font-medium">Do</h3>
              <div className="space-y-1">
                <p className="text-xl font-medium">見出し1 (text-xl)</p>
                <p className="text-lg font-medium">見出し2 (text-lg)</p>
                <p className="text-base">本文 (text-base)</p>
              </div>
              <code className="text-muted-foreground block text-xs">1段階ずつ下げる</code>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="text-destructive font-medium">Don&apos;t</h3>
              <div className="space-y-1">
                <p className="text-3xl font-medium">見出し1 (text-3xl)</p>
                <p className="text-sm font-medium">見出し2 (text-sm)</p>
                <p className="text-xs">本文 (text-xs)</p>
              </div>
              <code className="text-muted-foreground block text-xs">サイズが飛びすぎ</code>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由: 視覚的階層が崩れ、情報の重要度が伝わりにくくなる。
          </p>
        </section>

        {/* ウェイト */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">ウェイトは2種類まで</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="text-success font-medium">Do</h3>
              <div className="space-y-2">
                <p className="font-medium">font-medium（見出し、強調）</p>
                <p className="font-normal">font-normal（本文）</p>
              </div>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="text-destructive font-medium">Don&apos;t</h3>
              <div className="space-y-2">
                <p className="font-black">font-black</p>
                <p className="font-extrabold">font-extrabold</p>
                <p className="font-medium">font-medium</p>
                <p className="font-medium">font-medium</p>
                <p className="font-light">font-light</p>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由: ウェイトの多用は視覚的ノイズになり、本当に強調したい部分が埋もれる。
          </p>
        </section>

        {/* テキスト色 */}
        <section className="bg-card border-border rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-medium">テキスト色で階層を表現</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="text-success font-medium">Do</h3>
              <div className="space-y-2">
                <p className="text-foreground">主要テキスト（text-foreground）</p>
                <p className="text-muted-foreground">補助テキスト（text-muted-foreground）</p>
              </div>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="text-destructive font-medium">Don&apos;t</h3>
              <div className="space-y-2">
                <p className="text-muted-foreground">text-gray-600（直接色指定）</p>
                <p className="text-muted-foreground">
                  text-muted-foreground（透明度の代わりにセマンティックトークン）
                </p>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            理由: セマンティックトークンでダークモード対応を自動化。
          </p>
        </section>
      </div>
    </div>
  ),
};
