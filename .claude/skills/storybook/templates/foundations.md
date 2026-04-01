# Foundations テンプレート

デザイントークンの可視化。`src/styles/tokens/` が対象。

## 他レイヤーとの違い

| 項目             | Primitives/Recipes      | Foundations                      |
| ---------------- | ----------------------- | -------------------------------- |
| `component` 指定 | あり                    | なし                             |
| Story 型         | `StoryObj<typeof meta>` | `StoryObj`（generic なし）       |
| Canvas テキスト  | 禁止                    | OK（ドキュメント的役割）         |
| ヘルパー         | 不要 or story-helpers   | ファイル内に可視化ヘルパーを定義 |

## 基本テンプレート

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Foundations/Colors',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj; // generic なし（component 未指定のため）

// ---------------------------------------------------------------------------
// 可視化ヘルパー
// ---------------------------------------------------------------------------

function ColorSwatch({
  tailwindClass,
  description,
}: {
  tailwindClass: string;
  description?: string;
}) {
  const token = tailwindClass.replace(/^(?:bg|text|border|ring)-/, '');
  return (
    <div className="flex items-center gap-4 py-2">
      <div
        className="border-border size-12 shrink-0 rounded-lg border"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <div>
        <code className="text-sm font-bold">{tailwindClass}</code>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
      </div>
    </div>
  );
}

function ColorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="border-border mb-4 border-b pb-2 text-lg font-bold">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const AllColors: Story = {
  render: () => (
    <div>
      <h1 className="mb-8 text-2xl font-bold">カラートークン</h1>
      <ColorGroup title="Surface（背景色）">
        <ColorSwatch tailwindClass="bg-background" description="ページ背景" />
        <ColorSwatch tailwindClass="bg-card" description="カード、ダイアログ" />
      </ColorGroup>
    </div>
  ),
};
```

## 可視化ヘルパーの設計

各 Foundations Story はトークンを視覚的に表示するヘルパーコンポーネントを定義する:

| Story      | ヘルパー                    | 表示内容                                        |
| ---------- | --------------------------- | ----------------------------------------------- |
| Overview   | —                           | 全トークンカテゴリの概要・リンク集              |
| Colors     | `ColorSwatch`, `ColorGroup` | カラーチップ + Tailwindクラス名                 |
| Typography | `TypographyRow`             | フォントサイズ・ウェイトのサンプル文            |
| Spacing    | `SpacingBlock`              | 余白の視覚的表示                                |
| Elevation  | `ElevationCard`             | Physical Lighting の段階比較                    |
| Radius     | `RadiusCard`                | border-radius の段階比較                        |
| ZIndex     | `ZIndexLayer`               | z-index レイヤーの可視化                        |
| Icons      | アイコングリッド            | lucide-react アイコン一覧                       |
| Motion     | アニメーション例            | transition/animation トークンの実例             |
| States     | `StateDemo`                 | hover/pressed/selected 等のインタラクション状態 |
| Responsive | `BreakpointIndicator`       | ブレークポイント・レスポンシブパターン          |

## MDX Docs との連携

Foundations Story には MDX Docs を併用することが多い:

```
src/styles/tokens/
├── colors.stories.tsx        # Canvas: カラーチップ描画
├── colors.mdx                # Docs: 使い分けテーブル + ガイドライン
├── typography.stories.tsx
└── typography.mdx
```

## Canvas にテキストを入れてOK

Foundations は**例外的に** Canvas 内に `<h1>`, `<h2>`, テーブル等を入れてよい。
デザイントークンの可視化はドキュメント的役割を持つため。

## 参考実装

- `src/styles/tokens/colors.stories.tsx` — カラートークン可視化
- `src/styles/tokens/typography.stories.tsx` — タイポグラフィ可視化
- `src/styles/tokens/elevation.stories.tsx` — Physical Lighting 可視化
