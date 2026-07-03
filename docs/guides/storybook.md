---
status: current
last_verified: 2026-07-02
---

# Dayopt Storybook

DayoptのUIコンポーネントとデザイントークンのカタログです。

## 🚨 大前提

> **Storybookに記載されているパターンのみ使用する**

- ✅ Storybookにある → 使ってOK
- ❌ Storybookにない → 使わない（対応していても）
- 🆕 新パターン → 先にStoryを追加してから使う

```tsx
// ✅ OK
<Button variant="ghost" size="icon">
  <Settings className="size-4" />
</Button>

// ❌ NG: size="xl" はStoryにない
<Button variant="link" size="xl">リンク</Button>
```

## 設計原則

「装飾のない基本体験」— 機能を伝えるために必要な要素だけを実装する。

- ✅ 控えめなホバー状態、セマンティックカラー、8px グリッド、シンプルなアイコン
- ❌ 派手なグラデーション、過剰なアニメーション、影の多用、装飾画像

UI/UX で迷ったら文脈に合う Google 製品を開いて観察する（GAFA-First）。
参考: Material Design 3 / Apple HIG / shadcn/ui (Radix UI)

### コンポーネント選択フロー

```
新しいUIコンポーネントが必要か？
├─ shadcn/ui にあるか？ → あれば使う（第一選択）
├─ HeadlessUI にあるか？ → 使う（a11y重視）
├─ 3箇所以上で使うか？ → components/common/ に追加
└─ 1-2箇所のみ？ → インラインで実装
```

---

## 📁 構成

| カテゴリ        | 内容                                          | 例                                               |
| --------------- | --------------------------------------------- | ------------------------------------------------ |
| **Docs**        | ガイドライン・アーキテクチャ                  | Accessibility                                    |
| **Foundations** | デザイントークン・設計基盤                    | Colors, Typography, Spacing, Elevation           |
| **Primitives**  | 単体UIコンポーネント                          | Button, Badge, Input, Dialog                     |
| **Recipes**     | 2つ以上の Primitive を組み合わせた複合UI      | ActionFooter, Field, ConfirmDialog, Inspector/\* |
| **Features**    | ドメインロジックを含む Feature コンポーネント | Entry/_, Calendar/_, Tags/\*                     |
| **Patterns**    | 実装パターンのカタログ                        | Forms, Feedback, Loading                         |

## 🎨 カラートークン

Tailwindクラス名で統一。そのままコピペ可能。

```tsx
// ✅ OK
<div className="bg-card text-foreground border-border" />

// ❌ NG
<div style={{ color: 'var(--foreground)' }} />
```

| プレフィックス | 例                                                     |
| -------------- | ------------------------------------------------------ |
| `bg-*`         | `bg-container`, `bg-background`, `bg-card`, `bg-muted` |
| `text-*`       | `text-foreground`, `text-muted-foreground`             |
| `border-*`     | `border-border`                                        |
| `ring-*`       | `ring-primary`                                         |

## 🖥️ Canvas と Docs の役割分離

| タブ       | 役割               | 内容                           |
| ---------- | ------------------ | ------------------------------ |
| **Canvas** | コンポーネント描画 | render のみ。テキスト禁止      |
| **Docs**   | ドキュメント       | テキスト + テーブル + Controls |

**Canvas** — 純粋なコンポーネント描画だけを置く。`<h1>`, `<h2>`, `<p>` 等の説明文は禁止。
AllPatterns も同様に、コンポーネントを `flex-col gap-6` で並べるだけ。

**Docs** — テーブルが必要なら MDX（`.docs.mdx`）で作成。不要なら `tags: ['autodocs']` + JSDoc で十分。

公式テンプレート: `Shared/Components/Overlays/AlertDialog`

## 🛠️ 開発者向け

### Storyの追加手順

1. `*.stories.tsx` を作成（Canvas用）
2. テーブルが必要なら `*.docs.mdx` を作成（Docs用）
3. `AllPatterns` Story を追加（全パターン一覧）
4. PRでレビュー → マージ後に使用可能

```
src/components/ui/my-component.tsx            # コンポーネント
src/components/ui/my-component.stories.tsx     # Story（Canvas）
src/components/ui/my-component.docs.mdx        # Docs（テーブルが必要な場合のみ）
```

### 命名規則（所有境界 taxonomy）

story の `title:` の **top-level は所有境界（どの package / app の資産か）** で分ける。第二階層以下は責務ベース。決定の経緯は [ADR-023](../engineering/log/2026-06-24-storybook-ownership-taxonomy.md)。

- `Shared/Foundations/Colors` → デザイントークン
- `Shared/Components/Actions/Button` → 共有 UI コンポーネント（`packages/components`）
- `Product/Features/Navigation/AppHeader` → product のナビゲーションコンポーネント
- `Product/Features/Entry/Inspector/EntryInspector` → product の Feature コンポーネント
- `Web/Sections/Pricing` → web LP のセクション（現状は構造予約のみ）
- `Docs/はじめに` → ドキュメント（top-level doc は所有境界の外）

#### title prefix は物理位置で決まる

新規 story の prefix は「ファイルがどこに在るか」で機械的に決まる。下表に従う。

| 物理位置                                     | title prefix                                                |
| -------------------------------------------- | ----------------------------------------------------------- |
| `packages/components/src/**`                 | `Shared/Components/`                                        |
| `packages/foundations/src/**`                | `Shared/Foundations/`                                       |
| `apps/storybook/.storybook/stories/patterns` | `Shared/Patterns/` または `Product/Patterns/`（依存ベース） |
| `apps/product/src/components/**`             | `Product/Components/`                                       |
| `apps/product/src/features/**`               | `Product/Features/`（一部 `Product/Components/`）           |
| `apps/product/src/emails/**`                 | `Product/Emails`                                            |
| `apps/web/src/**`                            | `Web/`                                                      |

- **Patterns の依存ベース分離**: import が `@/`（product 内部）に依存 → `Product/Patterns/`。`@dayopt/components` だけに依存 → `Shared/Patterns/`。
- **例外**: `apps/product/src/lib/styles/tokens/**` の token doc はサイドバー一貫性を優先し `Shared/Foundations/States` に揃える（title と物理位置の軽微な不一致を許容）。

このルールは `scripts/check-story-taxonomy.ts` が CI（`pnpm storybook:taxonomy`）で機械検証する。逸脱した title は lint job で hard-fail する。

### 同期ルール

コンポーネントを変更したら、Storyも同時に更新する。

- props追加 → argTypes + 使用例を追加
- props削除 → argTypes + 該当Storyを削除
- variant追加 → AllPatternsに追加

## ✅ チェックリスト

Story作成時に確認：

- [ ] AlertDialog テンプレートの構成に従っている
- [ ] Canvas にテキストを入れていない
- [ ] JSDoc は1行で簡潔に記述
- [ ] `AllPatterns` Storyを作成
- [ ] アイコンボタンに `aria-label` を設定
- [ ] セマンティックトークンを使用（`bg-background` 等）
- [ ] 直接カラーを使っていない（`text-blue-500` 等）

## ⛔ 避けるべきパターン

**Canvas にテキスト** — 見出し・説明文は Docs へ。Canvas はコンポーネントのみ。

**Story爆発** — 全組み合わせを個別Storyにしない。`AllPatterns` + Controls で対応。

**データ依存** — tRPC/Zustand依存コンポーネントは無理にStorybookに入れない。

詳細: `.claude/skills/storybook/SKILL.md`

## 📚 推奨リーディングパス

初めてDayoptのコードベースに触れる場合、以下の順に読むとスムーズです：

| 順番 | ドキュメント                                                        | 内容                                           |
| ---- | ------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | [Dayopt コンセプト](../business/concept.md)                         | Dayoptとは何か、ジョブ、プロダクト原則         |
| 2    | [Domain Glossary](../glossary/terms.md)                             | Entry, EntryState, Chronotype 等のドメイン用語 |
| 3    | [Developer Map](../log/archive/developer-map.md)                    | ディレクトリ構成と「どこに何があるか」         |
| 4    | [Packages Overview](../architecture/overview.md)                    | monorepo packages の責務境界と token 移行方針  |
| 5    | [Data Flow](../architecture/data-flow.md)                           | UI → tRPC → Supabase のデータの流れ            |
| 6    | [Common Pitfalls](../guides/common-pitfalls.md)                     | よくある間違いと正しいパターン                 |
| 7    | Colors（Storybook: Shared/Foundations/Colors）                      | カラートークン、Surface体系                    |
| 8    | Typography（Storybook: Foundations/Typography）                     | フォントサイズ、行間、ウェイト                 |
| 9    | [Accessibility](../architecture/frontend/accessibility/overview.md) | a11yチェックリスト、WCAG準拠                   |
