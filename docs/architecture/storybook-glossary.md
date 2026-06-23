# Storybook 公式用語集

Storybook 8 の構成要素を公式用語に基づいて整理したリファレンス。

---

## 1. ファイルとフォーマット

| 用語                             | 説明                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSF (Component Story Format)** | `.stories.tsx` ファイルの書式規格。現行は **CSF3**。default export（Meta）+ named export（Story）の構造を持つ。                             |
| **MDX**                          | Markdown + JSX を組み合わせた形式。カスタムドキュメントページの作成に使う。`main.ts` の `stories` で `../src/**/*.mdx` を対象に含めている。 |

---

## 2. Story 定義の構成要素

`.stories.tsx` ファイルの中身。

### Meta（default export）

コンポーネント単位の設定オブジェクト。`satisfies Meta<typeof Component>` で型付けする。

```tsx
const meta = {
  title: 'Components/UI/Button', // Sidebar上のパス
  component: Button, // 対象コンポーネント
  tags: ['autodocs'], // 自動ドキュメント生成
  argTypes: {
    /* ... */
  }, // Controls設定
  decorators: [
    /* ... */
  ], // ラッパー
  parameters: {
    /* ... */
  }, // 静的メタデータ
} satisfies Meta<typeof Button>;

export default meta;
```

### Story（named export）

コンポーネントの **1 つの状態** を表すオブジェクト。名前がそのまま Sidebar のラベルになる。

```tsx
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: 'default', children: 'Click me' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete' },
};
```

### 各プロパティ

| プロパティ          | レベル                | 説明                                                                                                                                                                             |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **StoryObj**        | 型                    | Story の型定義。`type Story = StoryObj<typeof meta>` で使う。                                                                                                                    |
| **Args**            | Meta / Story          | Story に渡す props（コンポーネントの入力値）。Controls パネルから操作可能。                                                                                                      |
| **ArgTypes**        | Meta / Story          | Args の型情報と Controls パネルでの表示方法を定義。`control` の種類（select, boolean 等）や `options` を指定する。                                                               |
| **Render function** | Story                 | Story の描画方法をカスタムする関数。`render: (args) => <Component {...args} />`。複数コンポーネントの組み合わせ表示に使う。                                                      |
| **Play function**   | Story                 | Story の描画後に自動実行されるインタラクション関数。`@storybook/addon-interactions` と組み合わせてユーザー操作をシミュレーションする。                                           |
| **Decorators**      | Meta / Story / Global | Story を囲むラッパー。Provider 注入やレイアウト調整に使う。Dayopt では `preview.tsx` でグローバル Decorator を設定（テーマ切替、`NextIntlClientProvider`、`TRPCMockProvider`）。 |
| **Parameters**      | Meta / Story / Global | Story や addon の振る舞いを制御する静的メタデータ。`backgrounds`, `docs`, `a11y` など addon ごとの設定を持つ。                                                                   |
| **Tags**            | Meta / Story          | Story の分類ラベル。`'autodocs'` で自動ドキュメント生成を有効化する。                                                                                                            |
| **Loaders**         | Meta / Story          | Story 描画前に非同期データを取得する関数。`loaded` プロパティ経由で Story に渡される。                                                                                           |

---

## 3. Storybook UI の構成要素

画面の各パーツ。

```
┌─────────────────────────────────────────────────┐
│                   Toolbar                        │  ← GlobalTypes（テーマ切替など）
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Sidebar  │            Canvas                    │  ← Story描画エリア
│          │         or Docs page                 │  ← autodocs自動生成ページ
│          │                                      │
│          ├──────────────────────────────────────┤
│          │         Addons panel                  │  ← Controls, Actions, A11y
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

| パーツ             | 説明                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sidebar**        | 左側の Story ツリー。Meta の `title` 階層（例: `Components/UI/Button`）で構成される。Dayopt では `storySort` で `Docs > Foundations > UI > Features > Patterns` の順に並べている。 |
| **Canvas**         | Story を描画するメインエリア。1 つの Story を単独で表示する。                                                                                                                      |
| **Docs page**      | `tags: ['autodocs']` で自動生成されるドキュメントページ。コンポーネントの全 Story と props テーブルを一覧表示する。Dayopt では `DocsTemplate` でページレイアウトをカスタム。       |
| **Controls panel** | ArgTypes に基づくインタラクティブな props 操作パネル。Story の Args をリアルタイムに変更できる。                                                                                   |
| **Actions panel**  | イベントハンドラ（`onClick`, `onChange` 等）の呼び出しログを表示するパネル。                                                                                                       |
| **Toolbar**        | 上部バー。GlobalTypes で定義したツールを配置する。Dayopt ではテーマ切替（Light / Dark）を設定。                                                                                    |
| **Addons panel**   | 下部のタブ切替パネル。Controls, Actions, A11y などの addon が表示される。                                                                                                          |

---

## 4. インフラ（設定ファイル）

`.storybook/` ディレクトリに配置する設定ファイル群。

| ファイル        | 役割                                                                          | Dayopt での設定内容                                                                                                              |
| --------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **main.ts**     | Storybook の中核設定。Story 対象ファイル、addons、framework を定義。          | stories glob, framework: `react-vite`, addons: docs / essentials / a11y / interactions, `reactDocgen: 'react-docgen-typescript'` |
| **preview.tsx** | Story 描画環境の設定。グローバル Decorators, Parameters, GlobalTypes を定義。 | テーマ切替 Decorator、`NextIntlClientProvider` / `TRPCMockProvider` の注入、a11y ルール設定、Controls matchers                   |
| **manager.ts**  | Storybook UI そのもの（Sidebar, Toolbar）の外観設定。                         | テーマ、ブランディングなど                                                                                                       |

### Addons（拡張機能パッケージ）

Dayopt で使用している addon:

| Addon                           | 説明                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| `@storybook/addon-docs`         | MDX サポートと autodocs 自動生成。`remarkGfm` プラグインを追加。    |
| `@storybook/addon-essentials`   | Controls, Actions, Viewport, Backgrounds 等のバンドル。             |
| `@storybook/addon-a11y`         | axe-core ベースのアクセシビリティチェック。WCAG 2.1 AA 準拠で設定。 |
| `@storybook/addon-interactions` | Play function のステップ実行・デバッグ。                            |
| `@storybook/addon-onboarding`   | 初回利用時のガイド。                                                |

---

## 5. 自動ドキュメント生成

| 用語                        | 説明                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Autodocs**                | Meta に `tags: ['autodocs']` を追加することで有効化。Meta と Story の情報から Docs ページを自動生成する。Dayopt では `DocsTemplate` でページレイアウトをカスタム。 |
| **react-docgen-typescript** | TypeScript の型情報（props の型、デフォルト値、JSDoc コメント）から props テーブルを自動生成する仕組み。`main.ts` の `typescript.reactDocgen` で有効化。           |
