---
name: docs-audit
description: 公開 docs（apps/web/content/docs）の監査の明示依頼時と月次ガーデニングの公開コンテンツ監査で発動。プロダクトの実機能と公開 docs を突き合わせ、未カバー機能・鮮度乖離・en/ja 非対称を検出して報告し、承認後に area:docs ラベルで起票する。docs 本文の生成や内部 docs/ の監査では発動しない。
user_invocable: true
---

# 公開 docs 監査スキル

プロダクトの実機能とユーザー向け公開 docs（`apps/web/content/docs/`）を突き合わせ、不足・陳腐化を検出して報告する。本文は生成しない。

## When to Use

**明示発動型** — explicit な監査依頼のみを契機とする。

- `/docs-audit` で手動実行する時
- 月次ガーデニング（`/gardening`）の公開コンテンツ監査ステップから呼ばれる時
- リリース後に docs 更新漏れを確認したい時
- en/ja の翻訳対称性だけを確認したい時

## When NOT to Use

この skill は **explicit な監査依頼のみを契機とする**。参考として近接するが発動しないケース:

- 検出したギャップの docs 本文執筆 → `docs-writing` skill
- 内部ドキュメント（repo 直下 `docs/`）の鮮度チェック → `/gardening` の Step 2
- ブログのネタ出し → `blog-ideas` skill

## 実行手順

### Step 1: 情報収集

以下のソースを並行で読み込む:

1. **プロダクトの機能一覧**: `ls apps/product/src/features/` と `apps/product/src/app/` のルート構造
2. **最近の変更**: `git log --oneline -30 -- apps/product/`
3. **既存 docs 一覧**: `apps/web/content/docs/{en,ja}/**/*.mdx`（frontmatter + 冒頭を読む）
4. **既存 Issue**: `gh issue list --label "area:docs" --state all --limit 50`（重複チェック用）

### Step 2: ギャップ検出

#### A. 未カバーの機能

`apps/product/src/features/` に存在するがユーザー向け docs がない機能を洗い出す。判定基準は「ユーザーが操作する主要機能（calendar / tags / review / settings / timeblock 等）に対応する docs があるか」。内部専用 feature は対象外。

#### B. 鮮度チェック

既存 docs が説明する機能の product 側コードが docs より後に大きく変わっていないか確認する。

```bash
git log --oneline -5 -- apps/product/src/features/<feature>/
git log --oneline -5 -- apps/web/content/docs/ja/features/<feature>.mdx
```

docs の最終更新と product 側の最終コミットを比較し、乖離が大きいものをフラグする。

#### C. en/ja 対称性

`content/docs/en/` と `content/docs/ja/` のファイル対応を比較し、片側にしかないファイルを列挙する（`pnpm --filter @dayopt/web validate:content` の warning も参照）。

### Step 3: 報告

```
## ギャップ検出結果

### 未カバーの機能（docs なし）
| 機能 | product 側パス | 優先度 | 理由 |
|---|---|---|---|

### 鮮度チェック（更新が必要な可能性）
| docs ファイル | 最終更新 | product 側最終変更 | 乖離 |
|---|---|---|---|

### en/ja 翻訳の不足
| 存在する側 | 欠けている側 |
|---|---|
```

### Step 4: ユーザー選択

AskUserQuestion で対応するものを選択してもらう（**multiSelect: true**）。

### Step 5: GitHub Issue 起票

承認されたものを `gh issue create` で起票する（monorepo ルートで実行）。

```bash
gh issue create \
  --title "[docs] [機能名]: [新規作成 or 更新 or 翻訳追加]" \
  --label "area:docs" \
  --body "$(cat <<'EOF'
## 種別

新規作成 / 更新 / 翻訳追加

## 対象機能

[機能名]

## product 側の参照パス

- `apps/product/src/features/[該当feature]/`

## 現状の docs

[既存ファイルパスまたは「なし」]

## 検出理由

[ギャップ / 鮮度乖離 / 翻訳不足]

---
🤖 Generated with `/docs-audit` skill
EOF
)"
```

## docs の運用方針

- **薄く書く**: 各機能の概要 + 主要な使い方のみ（文章基準は `docs/ai/writing-style.md`、役割分担は `docs/ai/docs-policy.md`）
- **都度更新**: プロダクトの振る舞いを変えたら同じ流れで docs も更新する（`docs/marketing/content-operations.md`）
- **AI 更新**: 執筆は `docs-writing` skill が `draft: true` で行い、開発者レビュー後に公開する

## やらないこと

- docs の本文を自動生成する（検出と報告のみ。執筆は `docs-writing` skill）
- 全機能の docs を一気に書く（優先度の高いものから段階的に）
- 内部開発ドキュメント（repo 直下 `docs/`）の監査（`/gardening` Step 2 の領域）
