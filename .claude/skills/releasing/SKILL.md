---
name: releasing
description: Dayopt の release 作業を end-to-end で実行する時に発動。明示的な release 意図（「v0.X.0 をリリース」「リリースしたい」「タグを切る」）を契機に、現在の git state（feature branch / main / tag 状態）を自動判定し、適切な Phase（version bump → 品質チェック → PR merge → tag → GitHub Release → リリースノート）から開始する。明示的な release 意図がない限り他のトリガーでは発動しない。
effort: high
maxTurns: 25
---

# Releasing Skill

Dayoptプロジェクトのリリース作業を安全かつ確実に実行するためのスキルです。

## When to Use

**明示発動型** — この skill はユーザーの explicit な release 意図のみを契機に発動する（コード変化や他 skill からの handoff では発動しない）。

- 「v{n}.{n}.{n} をリリースしたい」「リリース作業を進める」等、明確な release 意図が発話された時
- tag 作成（`git tag v...`）や GitHub Release 作成を明示的に指示された時
- `package.json` の `version` フィールドを bump する作業を指示された時
- 既存タグに対応する GitHub Release / リリースノートを更新・作成する指示時

## When NOT to Use

この skill は **explicit release 意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 単なる `main` への merge（tag / release を伴わない）→ 通常の git 操作
- commit 作成のみで version bump を含まない時 → 通常の development flow
- Breaking change を含む変更が release 作業と分離されている時 → `docs-writing` skill で ADR / 技術ドキュメント更新を先行

## 状態自動判定

スキル起動時、まず現在の状態を判定して適切なフェーズから開始する：

```
ユーザー: 「v0.17.0リリースしたい」
│
├─ featureブランチにいる？（PRがオープン）
│  └─ Phase 0 から: version bump → 品質チェック → PRマージを促す → タグ → リリースノート
│
├─ mainにいてタグがまだ？
│  └─ Phase 1 から: タグ作成・push → リリースノート
│
├─ タグはあるがReleaseがまだ？
│  └─ Phase 2 から: GitHub Actions確認 → リリースノート
│
└─ タグもReleaseも既にある？
   └─ Phase 3 から: リリースノート上書きのみ
```

### 判定コマンド

```bash
# 1. 現在のブランチを確認
git branch --show-current

# 2. タグの存在確認
git tag -l "v${VERSION}"

# 3. GitHub Releaseの存在確認
gh release view v${VERSION} 2>/dev/null && echo "exists" || echo "not found"

# 4. package.json の現在バージョン
node -p "require('./package.json').version"
```

## リリースワークフロー

```
Phase 0: 準備（featureブランチにいる場合）
  ├── 0.1 バージョン番号決定・重複チェック ← 最重要
  ├── 0.2 package.json バージョン更新（このPRに含める）
  └── 0.3 コード品質確認（lint, typecheck, test, build）
  → ユーザーにPRマージを促す

Phase 1: タグ作成・リリース（mainブランチ）
  ├── 1.1 mainブランチ最新取得
  ├── 1.2 Gitタグ作成・プッシュ
  └── 1.3 GitHub Actions 自動実行の確認
       ├── 本番デプロイ
       └── GitHub Release作成（auto-generated notes）

Phase 2: リリースノート反映
  ├── 2.1 前回リリース以降の全PRを取得
  ├── 2.2 詳細なリリースノートを作成
  └── 2.3 gh release edit で GitHub Release に反映

Phase 3: リリース後作業
  ├── 3.1 デプロイ確認
  └── 3.2 Sentry監視
```

## 必須チェック項目

### Phase 0.1: バージョン重複チェック（スキップ厳禁）

```bash
# 1. 既存リリースを確認
gh release list

# 2. 重複チェック
VERSION="0.X.0"  # リリースするバージョン
gh release view v${VERSION} 2>/dev/null && echo "❌ Already exists!" || echo "✅ OK"
```

**重複が見つかった場合**: 必ず「v0.X.0ではなくv0.Y.0じゃないですか？」と確認する

### Phase 0.2: package.json バージョン更新

```bash
# 現在のPRブランチでバージョンを更新
npm version ${VERSION} --no-git-tag-version
# → コミットに含める（タグ打ち前にmainのpackage.jsonが正しい状態になる）
```

**ポイント**: リリース前の最後のPRにversion bumpを含めることで、タグ打ち後の後片付けがゼロになる。

### Phase 0.3: コード品質

```bash
pnpm lint && pnpm typecheck && pnpm test:run && pnpm build
```

### Phase 1.1: mainブランチ最新取得

```bash
git checkout main
git pull origin main
```

### Phase 1.2: Gitタグ作成・プッシュ

```bash
git tag v${VERSION}
git push origin v${VERSION}
```

タグpushにより GitHub Actions が自動で以下を実行：

- 本番デプロイ（Vercel）
- GitHub Release作成（GitHub auto-generated notes）

### Phase 1.3: 自動実行の確認

```bash
# ワークフローの実行状況を確認
gh run list --workflow=create-release.yml --limit 1

# リリースが作成されたことを確認
gh release view v${VERSION}
```

### Phase 2: リリースノート反映（詳細化必須）

#### Step 1: PRとコミット情報を取得

```bash
# 前回リリース以降の全PRを取得
gh pr list --state merged --base main --limit 100 --json number,title,mergedAt

# 各PRのコミット詳細を取得（重要：PRタイトルだけでは不十分）
for pr in <PR番号リスト>; do
  echo "=== PR #$pr ==="
  gh pr view $pr --json title,body --jq '.title + "\n" + .body'
  echo "--- Commits ---"
  gh pr view $pr --json commits --jq '.commits[].messageHeadline'
done
```

#### Step 2: 詳細なリリースノートを作成

**粒度の基準**: 第三者が見ても「何が変わったか」がわかるレベル

**構造テンプレート**: `apps/storybook/docs/operations/releases/template.mdx` を参照

**❌ 悪い例（抽象的）**:

```markdown
- タグ機能リファクタリング
- パフォーマンス改善
```

**✅ 良い例（具体的）**:

```markdown
#### タグ機能の大幅強化 ([#910])

**データモデル変更**

- タグの親子階層モデルへ移行（`tag_groups` テーブル → `parent_id` カラム）
- 子タグの昇格処理を含むタグマージ機能

**UI/UX改善**

- タグ作成モーダルをポータルで実装（モーダル内でも正常動作）
- カレンダーサイドバーでのタグドラッグ&ドロップ並び替え
- 未タグ付けフィルターにアイコンと件数表示

**楽観的更新**

- タグ作成・編集・削除・マージ・並び替えに楽観的更新を実装
```

#### Step 3: 必須セクション

1. **新機能 (Added)**: 機能名 + 具体的な実装内容
2. **変更 (Changed)**: 何がどう変わったか + 影響範囲
3. **バグ修正 (Fixed)**: 問題の原因 + 修正内容
4. **パフォーマンス (Performance)**: 最適化内容 + 改善値（あれば）
5. **破壊的変更 (Breaking Changes)**: DB変更、削除されたAPI/コンポーネント

#### Step 4: GitHub Release に反映

```bash
# 一時ファイルにリリースノートを書き出してから反映
gh release edit v${VERSION} --notes-file /tmp/release-notes-v${VERSION}.md
```

#### チェックリスト

- [ ] 各PRのコミットを確認した
- [ ] 抽象的な記述を具体化した
- [ ] データモデル変更を明記した
- [ ] 削除されたコンポーネント/機能をリストした
- [ ] Full Changelogリンクがある

### Phase 3: リリース後作業

```bash
# デプロイ確認
# Vercel Dashboard で本番環境の動作確認

# Sentryでエラー監視
# エラーが急増していないことを確認
```

## よくある失敗

| 失敗                   | 対策                                           |
| ---------------------- | ---------------------------------------------- |
| バージョン重複         | Phase 0.1で必ず `gh release view`              |
| リリースノートが抽象的 | 各PRのコミットを取得して具体的な変更内容を記載 |
| 破壊的変更の記載漏れ   | DB変更、削除コンポーネントを明記               |
| 一部PRのみ記載         | `gh pr list --state merged` で全件取得         |
| Full Changelog抜け     | template.mdの構造を参考にする                  |
| version bump忘れ       | Phase 0.2でPRに含める（タグ前に完了）          |

## スクリプト

### バージョン重複チェック

```bash
.claude/skills/releasing/scripts/check-version.sh 0.X.0
```

### マージ済みPR取得

```bash
.claude/skills/releasing/scripts/get-merged-prs.sh
```

## 詳細ドキュメント

完全なチェックリスト: `apps/storybook/docs/operations/releases/checklist.mdx`
