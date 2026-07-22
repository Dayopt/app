---
name: docs-writing
description: 新機能実装完了後のユーザー向けドキュメント（`apps/web/content/docs/**/*.mdx`）執筆時、リリース完了後のリリースノート（`apps/web/content/releases/{en,ja}/*.mdx`）作成時、アーキテクチャ意思決定確定後の decision ログ（技術判断・プロダクト判断ともに各ドメインの `log/YYYY-MM-DD-slug.md`）作成時、Breaking change を含む変更の merge 前の技術ドキュメント更新時、`docs-audit` skill からの docs gap フィードバック受領時に発動。AI 生成時は `draft: true` 初期値を適用する。コード内コメントや一時メモでは発動しない。
effort: high
maxTurns: 25
---

# ユーザー向けドキュメント執筆スキル

web側（`apps/web/content/`）へのユーザー向けコンテンツを執筆するスキル。
app側の技術ドキュメント（`docs/`）とは別物。

## When to Use

**副次トリガー型** — この skill は「コード変化」ではなく「上位イベント確定後のドキュメント化タイミング」で発動する。

**上位イベント起点（何が確定したか）:**

- 新機能の public API 仕様が確定し、ユーザー向け使い方ドキュメントが必要になった時
- リリース作業完了後、`apps/web/content/releases/{en,ja}/*.mdx` にリリースノートを書く時
- アーキテクチャ意思決定が確定し、decision ログを書く時（技術判断・プロダクト判断ともに各ドメインの `log/YYYY-MM-DD-slug.md` が正本。`/decision` コマンド参照）
- Breaking change を含む変更を merge する前、影響を受ける技術ドキュメントの更新が必要な時

**診断起点（何に気付いたか）:**

- 機能実装は完了しているが対応するユーザードキュメントが未整備と気付いた時
- `docs-audit` skill から docs gap / 鮮度低下のフィードバックを受けた時
- 既存 ADR の前提条件が変わり、更新 ADR（supersede 関係）が必要と気付いた時

## When NOT to Use

- コード内コメント（`CLAUDE.md` の「コメント最小限」ルールに従う、skill 層の範囲外）
- 一時メモ・個人メモ・ミーティングノート（公開されない情報）
- 自明な内容の重複記録（型定義・命名で自己説明できる内容）

---

## レビューワークフロー（AI生成コンテンツ）

AI が記事を作成する場合は必ず `draft: true` で作成し、開発者がレビュー後に公開する。

```
1. AI が draft: true で記事を作成（en/ja 両ファイル）
2. 開発者がレビュー（内容・フロントマター・リンク確認）
3. OK → draft: false に変更してコミット → 本番公開
4. NG → フィードバックして AI に修正依頼
```

**`draft: true` のファイルはビルドから除外され、本番に公開されない。**

---

## 対象コンテンツ種別

| 種別         | ディレクトリ                              | 用途                                                    |
| ------------ | ----------------------------------------- | ------------------------------------------------------- |
| **docs**     | `apps/web/content/docs/**/*.mdx`          | 機能ドキュメント（Getting Started, Features, Guides等） |
| **blog**     | `content/blog/{en,ja}/*.mdx`              | ブログ記事（機能紹介、Tips、開発裏話等）                |
| **releases** | `apps/web/content/releases/{en,ja}/*.mdx` | リリースノート                                          |

---

## Frontmatterテンプレート

種別ごとのテンプレートとフィールド定義は以下を参照：

| 種別            | テンプレートファイル            |
| --------------- | ------------------------------- |
| docs            | `templates/docs-frontmatter.md` |
| blog / releases | `templates/blog-frontmatter.md` |

---

## 多言語対応

ロケールは **`en`（英語）** と **`ja`（日本語）** の2言語。

```
URL構造:
  英語: /docs/features/plans      （デフォルト、プレフィックスなし）
  日本語: /ja/docs/features/plans  （/ja/ プレフィックス）
```

**基本方針**: 全コンテンツで英語と日本語の両方を作成する。日英は直訳ではなく、それぞれの言語で自然な表現にする。

---

## ファイル配置ルール

```
apps/web/content/
├── docs/
│   ├── en/                    # 英語版（必須）
│   └── ja/                    # 日本語版（必須）
├── blog/
│   ├── en/
│   └── ja/
└── releases/
    ├── en/
    └── ja/
```

### ファイル名規則

| 種別     | ファイル名               | 例                               |
| -------- | ------------------------ | -------------------------------- |
| docs     | ケバブケース             | `plans.mdx`, `weekly-review.mdx` |
| blog     | ケバブケースで内容を表す | `timeboxing-tips.mdx`            |
| releases | バージョン番号           | `v0.16.0.mdx`                    |

---

## navigation.ts の更新

新しいドキュメントページを追加した場合、`apps/web/src/shell/navigation.ts` の `generateDocsNavigation()` にもエントリを追加する。

---

## 文体・スタイル

詳細は `references/style-guide.md` を参照。要点：

- ユーザー視点、平易な表現、能動態、具体的に
- **「：」（全角コロン）をテキスト中で使わない**（AI臭い文体）
- description は体言止め（メタ的な宣言を避ける）

---

## 品質チェックリスト

### Frontmatter

- [ ] 必須フィールドがすべて記述されている
- [ ] 日付は ISO 8601 形式（`YYYY-MM-DD`）
- [ ] `tags` は 3-6個（空配列 `[]` は禁止、不要なら省略）
- [ ] `ai.relatedQuestions` は 3-5個（手動で記述）
- [ ] `pnpm --filter @dayopt/web validate:content` でエラーがないことを確認した

### コンテンツ

- [ ] H1 は 1つのみ
- [ ] H2 で主要セクションを区切っている（RAGチャンク境界）
- [ ] コードブロックに言語指定がある
- [ ] 画像は `/public/images/` 配下（外部URL禁止）、`alt` 属性あり
- [ ] テンプレート文言（`[xxx]`等）が残っていない

### 多言語

- [ ] `en/` と `ja/` の両方にファイルを作成した
- [ ] 日英の内容が一致している（自然な表現で）
- [ ] 同一ファイル名で対応している

### ナビゲーション

- [ ] 新規ページの場合、`navigation.ts` にエントリを追加した

---

## 内部ドキュメント（app側 `docs/`）

app側の技術ドキュメント・ADR・APIドキュメントもこのスキルで対応する。

### ドキュメント種類の判断

```
何を記録したいか？
├─ 機能の仕組み → 技術ドキュメント（docs/engineering/）
├─ なぜこの方法を選んだか（技術判断） → engineering/log/YYYY-MM-DD-slug.md（正本）
├─ なぜこの方法を選んだか（プロダクト判断） → product/log/YYYY-MM-DD-slug.md（正本）
└─ APIの使い方 → APIドキュメント（docs/engineering/conventions-api.md）
```

### 内部ドキュメントのルール

1. **日本語で記述**（グローバル展開時は英語も検討）
2. **`docs/`ディレクトリに配置**
3. **過度に詳細にしない**（メンテナンスコストを考慮）
4. **コードが自明なら書かない**（型定義で十分な場合も多い）

---

## 詳細ドキュメント

| ドキュメント                    | 内容                              |
| ------------------------------- | --------------------------------- |
| `templates/docs-frontmatter.md` | docs用フロントマター定義          |
| `templates/blog-frontmatter.md` | blog/releases用フロントマター定義 |
| `references/style-guide.md`     | 執筆スタイルガイド・用語・MDX記法 |

## 参考ファイル

| ファイル                                         | 用途                                                  |
| ------------------------------------------------ | ----------------------------------------------------- |
| `apps/web/content/docs/ja/features/calendar.mdx` | 模範例（Feature Doc）                                 |
| `apps/web/src/lib/content-schemas.ts`            | Frontmatterスキーマの正式定義（Zod）                  |
| `docs/operations/runbook.md` 第4部               | リリースノートのカテゴリ定義（GitHub Release と共通） |
