---
name: docs-writing
description: ドキュメント執筆スキル。web側（~/Desktop/web/content/）へのユーザー向けドキュメント・ブログ・リリースノート作成、およびapp側（docs/）の技術ドキュメント・ADR作成時に自動発動。
effort: high
maxTurns: 25
---

# ユーザー向けドキュメント執筆スキル

web側（`~/Desktop/web/content/`）へのユーザー向けコンテンツを執筆するスキル。
app側の技術ドキュメント（`docs/`）とは別物。

## このスキルを使用するタイミング

以下のキーワードが含まれる場合に自動的に起動：

- 「ユーザードキュメント」「ヘルプページ」「使い方ガイド」
- 「ブログ記事」「リリースノート」
- 「web側のドキュメント」「content/docs」
- `/write-docs` コマンド実行時

## このスキルを使わない場合

- コード内コメント（CLAUDE.md: コメント最小限）
- 一時的なメモ
- 自明な内容の記録（型定義で十分な場合も多い）

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

| 種別         | ディレクトリ                     | 用途                                                    |
| ------------ | -------------------------------- | ------------------------------------------------------- |
| **docs**     | `content/docs/**/*.mdx`          | 機能ドキュメント（Getting Started, Features, Guides等） |
| **blog**     | `content/blog/{en,ja}/*.mdx`     | ブログ記事（機能紹介、Tips、開発裏話等）                |
| **releases** | `content/releases/{en,ja}/*.mdx` | リリースノート                                          |

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
~/Desktop/web/content/
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

新しいドキュメントページを追加した場合、`~/Desktop/web/src/lib/navigation.ts` の `generateDocsNavigation()` にもエントリを追加する。

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
- [ ] `npm run validate:content` でエラーがないことを確認した

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
├─ 機能の仕組み → 技術ドキュメント（docs/features/ or docs/architecture/）
├─ なぜこの方法を選んだか → ADR（docs/decisions/）
└─ APIの使い方 → APIドキュメント（docs/api/）
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

| ファイル                                           | 用途                          |
| -------------------------------------------------- | ----------------------------- |
| `~/Desktop/web/content/docs/features/calendar.mdx` | 模範例（Feature Doc）         |
| `~/Desktop/web/content/CLAUDE.md`                  | Frontmatterスキーマの正式定義 |
| `~/Desktop/web/src/lib/navigation.ts`              | ナビゲーション構造            |
