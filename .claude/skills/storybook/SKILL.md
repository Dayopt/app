---
name: storybook
description: Storybook Story作成スキル。UIコンポーネントのStory追加・更新時に自動発動。公式ベストプラクティスに基づいたStory作成を支援。
effort: medium
maxTurns: 15
---

# Storybook Story作成スキル

Storybookの公式ベストプラクティスに基づいたStory作成ガイド。

## このスキルを使用するタイミング

以下のキーワードが含まれる場合に自動的に起動：

- 「Storybook」「Story作成」「Story追加」
- 「stories.tsx」「.stories.」
- 「UIコンポーネントを追加」「コンポーネント作成」
- 「バリアント追加」「新しいパターン」

また、UIコンポーネント（`src/components/ui/`、`src/features/*/components/`）の作成・変更時にも参照すること。

---

## 最重要ルール：Storybookが正（Single Source of Truth）

> **Storybookに記載されているパターンのみを使用する**

| ルール                                     | 説明                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| **Storybookにある = 使ってOK**             | 各コンポーネントのStoryに記載されているprops/パターンのみ使用可能    |
| **Storybookにない = 使わない**             | 記載されていない機能は、たとえコンポーネントが対応していても使わない |
| **新しいパターンが必要 = 先にStoryを追加** | 新しい使い方をする前に、まずStoryを追加する                          |

### AI向けガイドライン

1. **UIコンポーネント使用前に確認**: `*.stories.tsx` を読んで使用可能なパターンを確認
2. **Storyにないパターンは提案しない**: コンポーネントが技術的に対応していても、Storyにないものは使わない
3. **新パターンが必要な場合**: 先にStoryを追加してからコードで使用する
4. **デザイントークン確認**: `src/styles/tokens/` のStoryで色・タイポグラフィ・余白の使用パターンを確認

---

## レイヤー判定フロー

コンポーネントの場所に応じて、使用するテンプレートが変わる:

```
コンポーネントの場所は？
│
├── src/styles/tokens/            → Foundations  → templates/foundations.md
├── src/components/ui/           → Components  → templates/components.md
├── src/components/common/       → Components  → templates/components.md
├── src/shell/components/        → Components  → templates/components.md
├── src/features/*/components/   → Components  → templates/components.md
└── src/stories/patterns/        → Patterns    → templates/patterns.md
```

**迷ったら**: ドメイン知識を持たない → `Components/`。ドメイン知識がある → `Features/`。

---

## 共通ルール（全レイヤー共通）

### CSF3 + satisfies Meta

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = {
  title: 'Components/UI/MyComponent',
  component: MyComponent,
  // ...
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;
```

**注意**: import は `@storybook/nextjs-vite`（`@storybook/react` / `@storybook/react-vite` ではない）

### Canvas と Docs の役割分離

| タブ       | 役割               | 内容                                        |
| ---------- | ------------------ | ------------------------------------------- |
| **Canvas** | コンポーネント描画 | render のみ。見出し・説明テキストは入れない |
| **Docs**   | ドキュメント       | テキスト説明 + テーブル + Controls          |

**例外**: Foundations と Patterns は Canvas 内にテキストを入れてOK（ドキュメント的役割）

### JSDoc

1行で簡潔に。改行すると Docs で段落間が空く。

```tsx
/** 基本的な削除確認ダイアログ。最小構成の例。 */
export const Default: Story = { ... };
```

### AllPatterns Story（必須）

全バリアントを一目で確認できる Story。`flex-col items-start gap-6` で縦並び。

```tsx
/** 全パターン一覧。 */
export const AllPatterns: Story = {
  render: () => <div className="flex flex-col items-start gap-6">{/* 全バリアントをここに */}</div>,
};
```

### セマンティックトークン

- `text-foreground`, `bg-card`, `border-border` 等のセマンティックトークンのみ使用
- `text-red-500`, `bg-blue-200` 等の直接カラーは禁止
- `font-bold` / `font-normal` のみ使用

### a11y

- アイコンボタンには `aria-label` を設定
- フォームで `<Label htmlFor="id">` を使用
- タッチターゲット最小 44x44px

### インタラクションテスト（play関数）

```tsx
import { expect, userEvent, within } from 'storybook/test';

export const ClickTest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(canvas.getByRole('button')).toHaveAttribute('data-clicked', 'true');
  },
};
```

---

## カテゴリ命名規則（title）

| ディレクトリ / 用途          | title prefix         | 例                                                       |
| ---------------------------- | -------------------- | -------------------------------------------------------- |
| `src/styles/tokens/`         | `Foundations/`       | `Foundations/Colors`, `Foundations/Typography`           |
| `src/components/ui/`         | `Components/UI/`     | `Components/UI/Button`, `Components/UI/AlertDialog`      |
| `src/components/common/`     | `Components/Common/` | `Components/Common/DateNavigator`                        |
| `src/shell/components/`      | `Components/Shell/`  | `Components/Shell/AppHeader`, `Components/Shell/Sidebar` |
| `src/features/*/components/` | `Features/`          | `Features/Entry/Inspector/EntryInspector`                |
| `src/stories/patterns/`      | `Patterns/`          | `Patterns/Feedback`, `Patterns/Forms`                    |
| `src/stories/docs/`          | `Docs/`              | `Docs/Introduction`, `Docs/Architecture/Data Flow`       |

---

## 運用ルール（Storyとコンポーネントの同期）

| 変更内容               | Story側の対応                       |
| ---------------------- | ----------------------------------- |
| コンポーネント新規作成 | 同時にStoryも作成                   |
| props追加              | argTypesに追加、Storyで使用例を追加 |
| props削除              | argTypesから削除、該当Storyを削除   |
| variant追加            | AllPatternsに追加                   |
| コンポーネント削除     | Storyも削除（孤児Story防止）        |

---

## チェックリスト

Story作成時の確認項目：

- [ ] レイヤー判定フローに従ったテンプレートを使用している
- [ ] Canvas にテキスト（`<h1>`, `<p>` 等）を入れていない（Foundations/Patterns 除く）
- [ ] JSDoc は1行で簡潔に記述した
- [ ] `AllPatterns` Story を作成した
- [ ] テーブルが必要な場合は MDX Docs を作成した（`tags: []` に変更）
- [ ] テーブル不要なら `tags: ['autodocs']` で JSDoc のみ
- [ ] アイコンボタンには `aria-label` を設定した
- [ ] セマンティックトークン（`bg-background` 等）を使用している
- [ ] 直接カラー（`text-blue-500` 等）を使っていない
- [ ] フォントウェイトは `font-bold` / `font-normal` のみ使用

---

## デザイントークンの確認

Story作成時、以下のFoundations Storiesを参照してデザイン一貫性を確保する：

| Story                    | 確認内容                     |
| ------------------------ | ---------------------------- |
| `Foundations/Colors`     | セマンティックカラー、状態色 |
| `Foundations/Typography` | フォントサイズ・ウェイト階層 |
| `Foundations/Spacing`    | 余白パターン                 |

---

## ESLint連携

`eslint-plugin-storybook` が有効。`*.stories.*` パターンに自動適用。

| ルール                          | 内容                              |
| ------------------------------- | --------------------------------- |
| `storybook/default-exports`     | `export default meta` が必要      |
| `storybook/hierarchy-separator` | title に `/` 区切りを使用         |
| `storybook/story-exports`       | 少なくとも1つのnamed exportが必要 |

---

## 関連スキル

Story対象のコンポーネントが依存する場合に参照:

| コンポーネントの依存 | 参照スキル                       |
| -------------------- | -------------------------------- |
| Zustand store        | `/store-creating`                |
| tRPC API             | `/trpc-router-creating`          |
| i18n（翻訳キー）     | `/i18n`                          |
| エラーハンドリング   | `/error-handling`                |
| a11y要件             | （Storybook a11yアドオンで確認） |

---

## 詳細ドキュメント

| ドキュメント               | 内容                                                      |
| -------------------------- | --------------------------------------------------------- |
| `templates/components.md`  | UIコンポーネント用テンプレート（単体・複合・Feature統合） |
| `templates/foundations.md` | デザイントークン可視化用テンプレート                      |
| `templates/patterns.md`    | 実装パターンドキュメント用テンプレート                    |
| `references/dark-mode.md`  | ダークモード3層アーキテクチャ                             |
| `references/mcp-addon.md`  | Storybook MCP Server 連携                                 |

## 参考リンク

- [How to write stories | Storybook](https://storybook.js.org/docs/writing-stories)
- [Component Story Format 3.0](https://storybook.js.org/blog/storybook-csf3-is-here/)
- [ArgTypes API](https://storybook.js.org/docs/api/arg-types)
- [Autodocs](https://storybook.js.org/docs/writing-docs/autodocs)
- [@storybook/addon-mcp](https://github.com/storybookjs/mcp)
