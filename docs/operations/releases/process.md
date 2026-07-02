---
status: current
last_verified: 2026-06-17
---

# リリースプロセス

Dayoptの正式なリリース作業手順を定義します。

## ⚠️ 必ず最初に確認

**🎯 実際にリリース作業を行う際は、[checklist](./checklist.md) を開いて、上から順番に全ての項目をチェックしてください。**

このドキュメント（RELEASE_PROCESS.md）は詳細な説明と背景情報を提供します。
実作業では RELEASE_CHECKLIST.md を使用してください。

---

## 📋 目次

- [前提条件](#前提条件)
- [リリース前チェックリスト](#リリース前チェックリスト)
- [リリース手順](#リリース手順)
- [リリース後の作業](#リリース後の作業)
- [ロールバック手順](#ロールバック手順)
- [トラブルシューティング](#トラブルシューティング)

## 前提条件

### 必要なツール

```bash
# Node.js & npm
node --version  # v20以上
npm --version

# GitHub CLI
gh --version

op --version

# Git
git --version
```

### 権限

- リポジトリへのWrite権限
- GitHub Releaseの作成権限
- Vercelプロジェクトへのアクセス権

### ブランチ保護設定（推奨）

**GitHub公式推奨**: `main`ブランチへの直接プッシュを禁止し、必ずPRを経由する

```bash
# GitHub Settings → Branches → Branch protection rules
# または GitHub CLI で設定
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]=lint \
  --field required_status_checks[contexts][]=typecheck \
  --field required_status_checks[contexts][]=unit-tests \
  --field required_status_checks[contexts][]=build \
  --field required_pull_request_reviews[required_approving_review_count]=1 \
  --field enforce_admins=false \
  --field restrictions=null
```

**推奨設定**:

- ✅ Require a pull request before merging
  - Require approvals: 1
- ✅ Require status checks to pass before merging
  - Require branches to be up to date before merging
  - Status checks: `lint`, `typecheck`, `unit-tests`, `build`
- ✅ Do not allow bypassing the above settings
- ❌ Allow force pushes (本番ブランチでは禁止)
- ❌ Allow deletions

## リリース前チェックリスト

### 1. コードの品質確認

```bash
# Lint チェック
npm run lint

# 型チェック
npm run typecheck

# テスト実行
npm run test:run

# ビルド確認
npm run build
```

### 2. ドキュメント確認

- [ ] 新機能のドキュメントが更新されている
- [ ] 破壊的変更がある場合、マイグレーションガイドが用意されている
- [ ] README.md が最新の状態である

### 3. Issue/PR確認

- [ ] マイルストーンに紐づく全てのIssueがクローズされている
- [ ] マイルストーンに紐づく全てのPRがマージされている
- [ ] 未解決の重大なバグがない

### 4. セキュリティ確認

```bash
# 依存関係の脆弱性チェック
npm audit

# ライセンスチェック
npm run license:check
```

## リリース手順

### Phase 0: Release PR作成（feature ブランチ → main）

> Dayopt に常設の `dev` ブランチは無い。リリースは番号付きの feature ブランチ（例: 直近 v0.30.0 は [#1370](https://github.com/Dayopt/dayopt/pull/1370)）を main へ PR する形で行う。version bump はこの Release PR に含める。

#### 0.1 リリースブランチの準備

```bash
# リリース対象の feature ブランチに切り替え（version bump を載せるブランチ）
git checkout <release-branch>
git pull origin <release-branch>

# main に追従（コンフリクトを避ける）
git fetch origin
git rebase origin/main   # または git merge origin/main
```

#### 0.2 version bump を PR に含める

```bash
VERSION="0.X.0"

# package.json のみ更新（タグはこの時点では打たない）
npm version ${VERSION} --no-git-tag-version
git commit -am "chore(release): v${VERSION} へ version bump"
```

タグ打ち前に main の `package.json` が正しい状態になるよう、version bump は必ずこの Release PR に含める（リリース後の後片付けがゼロになる）。

#### 0.3 ブランチの状態確認

```bash
# 未コミットの変更がないこと
git status

# 最新のコミット確認
git log -5 --oneline

# main との差分確認
git log main..HEAD --oneline
```

#### 0.4 Pull Request作成

```bash
# GitHub CLI でPR作成（--head は現在のリリースブランチ）
gh pr create \
  --base main \
  --head "$(git branch --show-current)" \
  --title "Release v${VERSION}" \
  --body "$(cat <<'EOF'
## 📦 Release v${VERSION}

### リリース内容
- docs/releases/v${VERSION}.md を参照

### リリース前チェックリスト
- [ ] npm run lint - 成功
- [ ] npm run typecheck - 成功
- [ ] npm run test:run - 成功
- [ ] npm run build - 成功
- [ ] リリースノート作成済み

### CI/CD
- GitHub Actions が自動実行されます
- Quality Gate 通過後にマージ可能になります

/cc @reviewer
EOF
)"

# または GitHub UI から手動作成
# https://github.com/Dayopt/dayopt/compare/main...<release-branch>
```

#### 0.5 CI/CD パイプライン確認

**自動実行されるチェック（`.github/workflows/ci.yml`）**:

**Phase 1: Quick Checks（並列実行 / 3分以内）**

- 🔍 ESLint & Prettier
- 🔤 TypeScript型チェック
- 🧪 Unit Tests（カバレッジ付き）
- 🌍 i18n Translation Check

**Phase 2: Quality Checks（並列実行 / 5分以内）**

- 🏗️ Build（Next.js本番ビルド）
- ♿ Accessibility（a11yチェック）
- 🔍 Heavy Analysis（License, API, Performance）
- 📚 Docs Consistency

**Phase 3: Quality Gate**

- 🚪 全チェック結果の集約
- 💬 PRへのサマリーコメント自動投稿

```bash
# CI/CD実行状況を確認
gh pr checks

# 詳細ログを確認
gh run view --log

# PRのステータスを確認
gh pr view
```

#### 0.6 レビュー & マージ

**マージ条件**:

- [ ] Quality Gate（全必須チェック）が通過
- [ ] **PR内容の目視確認完了**（承認者不在でも実施必須）
- [ ] コンフリクトなし

**⚠️ 重要: 一人開発での確認プロセス**

承認者がいない場合でも、以下の手順で**必ずPR内容を確認**してからマージすること：

```bash
# 1. CI/CD完了を確認
gh pr checks

# 2. PRの変更内容を確認（Web UIで詳細レビュー）
gh pr view --web

# 3. 変更ファイル一覧を確認
gh pr diff --name-only

# 4. 重要な変更を個別確認（例: 設定ファイル、セキュリティ関連）
gh pr diff -- package.json
gh pr diff -- .github/workflows/
gh pr diff -- src/middleware.ts

# 5. 確認完了後にマージ（Merge commit）
gh pr merge --merge --delete-branch

# または GitHub UI から手動マージ
# https://github.com/Dayopt/dayopt/pulls
```

**確認すべき項目**:

- [ ] 意図しない変更が含まれていないか
- [ ] セキュリティ上問題のある変更がないか
- [ ] 設定ファイルの変更が正しいか
- [ ] ドキュメントの更新が適切か
- [ ] コミットメッセージが適切か

> **マージ方式**: リポジトリ設定で squash / rebase は無効化され **merge commit に統一**されている（`mergeCommitAllowed: true`, `squashMergeAllowed: false`）。`--graph` で分岐・合流が追える履歴を残すため。
>
> **ブランチ削除**: feature ブランチは merge 後に削除する（`deleteBranchOnMerge: true`）。`--delete-branch` を付ける。

### Phase 1: main の取り込み確認

#### 1.1 mainブランチに切り替え

```bash
git checkout main
git pull origin main
```

#### 1.2 状態確認

```bash
# Release PR のマージが反映されていることを確認
git log -5 --oneline

# package.json のバージョンが更新済みであることを確認
node -p "require('./package.json').version"  # → ${VERSION} になっているはず
```

> main マージ時点で Vercel が本番へ自動デプロイする（タグはデプロイトリガーではなくバージョン記録用）。

### Phase 2: リリースノート作成

#### 2.1 前回リリース以降の全PRを取得

```bash
# バージョン番号を決定（例: v0.6.0）
VERSION="0.6.0"

# 前回リリースのタグを確認
git tag --sort=-creatordate | head -5

# 前回リリース以降のPR一覧を取得
gh pr list --state merged --base main --limit 100 --json number,title,mergedAt \
  | jq -r '.[] | select(.mergedAt > "YYYY-MM-DDT00:00:00Z") | "- [#\(.number)](https://github.com/Dayopt/dayopt/pull/\(.number)) - \(.title)"'
```

#### 2.2 リリースノートファイル作成

```bash
# テンプレートをコピー（配置場所: docs/releases/）
cp docs/releases/template.md docs/releases/RELEASE_NOTES_v${VERSION}.md
```

#### 2.3 リリースノート編集

```bash
# エディタで編集
vim docs/releases/RELEASE_NOTES_v${VERSION}.md
```

**⚠️ 重要: 記載内容**

前回リリース以降の**全てのPR**を以下のカテゴリに分類して記載：

- 新機能 (Added) - 各項目にPRリンクを付ける
- 変更 (Changed) - 各項目にPRリンクを付ける
- バグ修正 (Fixed) - 各項目にPRリンクを付ける
- 破壊的変更 (Breaking Changes)
- 削除 (Removed) - 各項目にPRリンクを付ける
- パフォーマンス (Performance) - 各項目にPRリンクを付ける
- セキュリティ (Security) - 各項目にPRリンクを付ける
- Pull Requests一覧 - 全PRをリストアップ

**品質基準:**

- [ ] 前回リリース以降の全てのPRが含まれている
- [ ] 各PRにリンクが付いている
- [ ] カテゴリ別に整理されている
- [ ] Full Changelogリンクが正しい

### Phase 3: タグ作成

version bump は Phase 0 の Release PR で済んでいる（`package.json` は更新済み）。ここでは main 上でタグを打つだけ。`npm version` は使わない（main への直接コミットを避けるため）。

> セムバーの目安（VERSION は Phase 0.2 で決定済み）: PATCH=バグ修正 / MINOR=新機能 / MAJOR=破壊的変更。

#### 3.1 タグ作成

```bash
# main 上で version 記録用タグを打つ
git tag v${VERSION}
```

#### 3.2 タグ内容の確認

```bash
# タグが指すコミットを確認（version bump コミットであること）
git show v${VERSION} --stat | head -20

# タグ一覧
git tag --list | tail -5
```

### Phase 4: タグのプッシュ

#### 4.1 タグをプッシュ

```bash
# main は Release PR のマージ時点で push 済み。ここではタグだけを push する
git push origin v${VERSION}
```

タグ push により GitHub Actions（`.github/workflows/create-release.yml`）が **GitHub Release を自動作成**する（auto-generated notes 付き）。本番デプロイは main マージ時点で Vercel が既に実行済み。

#### 4.2 プッシュ確認

```bash
# リモートのタグを確認
git ls-remote --tags origin

# GitHub上で確認
gh repo view --web
```

### Phase 5: GitHub Release のノート反映

Release 自体は Phase 4 のタグ push で **自動作成済み**（auto-generated notes）。ここでは Phase 2 で用意した詳細ノートに差し替える。

#### 5.1 詳細ノートを反映

```bash
# Phase 2 で作成した詳細リリースノートを一時ファイルに用意し、上書き反映
# 構造は ./template.md を参照
gh release edit v${VERSION} \
  --notes-file /tmp/release-notes-v${VERSION}.md
```

#### 5.2 Release確認

```bash
# 反映されたReleaseを確認
gh release view v${VERSION} --web
```

### Phase 6: デプロイ確認

#### 6.1 自動デプロイの監視

```bash
# Vercelのデプロイ状況を確認
# https://vercel.com/Dayopt/dayopt

# デプロイログを確認
npm run deploy:stats
```

#### 6.2 本番環境の動作確認

```bash
# ヘルスチェック
npm run deploy:health

# 本番環境にアクセスして動作確認
# https://dayopt.vercel.app
```

**確認項目:**

- [ ] サイトが正常に表示される
- [ ] 新機能が動作する
- [ ] 既存機能が正常に動作する
- [ ] エラーが発生していない
- [ ] パフォーマンスに問題がない

## リリース後の作業

### 1. マイルストーンのクローズ

```bash
# GitHub UI でマイルストーンをクローズ
# https://github.com/Dayopt/dayopt/milestones
```

### 2. 関連Issueの更新

```bash
# リリースされたことをIssueにコメント
gh issue comment <issue_number> \
  --body "Released in v${VERSION}: https://github.com/Dayopt/dayopt/releases/tag/v${VERSION}"
```

### 3. ドキュメントの更新

- [ ] README.md のバージョン番号更新（必要に応じて）
- [ ] docs/releases/README.md にバージョンを追加

### 4. 通知

- [ ] チームへのリリース通知
- [ ] ユーザーへのアナウンス（必要に応じて）

### 5. モニタリング

```bash
# Sentryでエラー監視
# https://sentry.io/organizations/dayopt/issues/

# アナリティクス確認
npm run analytics:stats
```

## ロールバック手順

### 緊急時のロールバック

#### 1. 重大な問題の確認

- クリティカルなバグ
- セキュリティ上の問題
- データ損失の可能性

#### 2. ロールバック実行

```bash
# Vercelで前のデプロイに戻す
npm run deploy:rollback

# または Vercel UI から前のデプロイをPromote
# https://vercel.com/Dayopt/dayopt/deployments
```

#### 3. GitHub Releaseの対応

```bash
# Releaseをドラフトに変更（削除はしない）
gh release edit v${VERSION} --draft

# 問題を説明するIssueを作成
gh issue create \
  --title "Rollback: v${VERSION} - Critical Issue" \
  --body "Description of the issue..."
```

#### 4. 修正版のリリース

```bash
# 問題を修正用の feature ブランチで対応し、version bump を含めて main へ PR
# （通常のリリースフローと同じ: Phase 0 → 4）
#   npm version patch --no-git-tag-version → commit → PR → merge（merge commit, ブランチ削除）

# main 取り込み後、main 上でタグを打って push（Release は自動作成される）
git checkout main && git pull origin main
git tag v${VERSION_PATCH}
git push origin v${VERSION_PATCH}
```

## トラブルシューティング

### Q: npm version でエラーが出る

```bash
# 未コミットの変更がある場合
git status
git add .
git commit -m "chore: prepare for release"

# または強制実行（非推奨）
npm version patch --force
```

### Q: タグのプッシュに失敗する

```bash
# タグの確認
git tag -l

# タグを削除して再作成（version bump は Release PR 済みなので git tag のみ）
git tag -d v${VERSION}
git tag v${VERSION}
git push origin v${VERSION}
```

### Q: GitHub Releaseの作成に失敗する

```bash
# GitHub CLI の認証確認
gh auth status

# 再ログイン
gh auth login

# 手動で作成
# https://github.com/Dayopt/dayopt/releases/new
```

### Q: デプロイが失敗する

```bash
# Vercelのログを確認
# https://vercel.com/Dayopt/dayopt/deployments

# ローカルでビルド確認
npm run build

# 環境変数の確認
npm run vercel:check
```

## チェックシート

### リリース実施チェックシート

```markdown
## リリース v${VERSION} チェックシート

### リリース前（リリースブランチ）

- [ ] npm run lint - 成功
- [ ] npm run typecheck - 成功
- [ ] npm run test:run - 成功
- [ ] npm run build - 成功
- [ ] version bump を Release PR に含めた（npm version --no-git-tag-version）
- [ ] リリースノート作成済み
- [ ] マイルストーンの全Issue/PRクローズ済み

### Phase 0: Release PR作成 & マージ（feature ブランチ → main）

- [ ] PRテンプレート記入完了
- [ ] CI/CD Quality Gate 通過
  - [ ] lint ✅
  - [ ] typecheck ✅
  - [ ] unit-tests ✅
  - [ ] build ✅
  - [ ] i18n-check ✅
  - [ ] accessibility ✅
  - [ ] heavy-checks ✅
  - [ ] docs-consistency ✅
- [ ] コードレビュー承認済み
- [ ] PRマージ完了（Merge commit / feature ブランチ削除）

### Phase 1-4: タグ作成 & プッシュ（mainブランチ）

- [ ] mainブランチに切り替え
- [ ] PRマージ内容・package.json バージョンを確認
- [ ] タグ作成（git tag v${VERSION}）
- [ ] Tag push完了（Release は自動作成）

### Phase 5-6: GitHub Release & デプロイ

- [ ] GitHub Release作成完了
- [ ] Vercelデプロイ成功
- [ ] 本番環境動作確認OK
- [ ] Sentryエラー監視OK

### リリース後

- [ ] マイルストーンクローズ
- [ ] 関連Issueへコメント
- [ ] チームへ通知完了

### 日時

- 開始: YYYY-MM-DD HH:MM
- 完了: YYYY-MM-DD HH:MM
- 実施者: @username
```

## リリースフロー概要図

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 0: Release PR（feature ブランチ → main）              │
├─────────────────────────────────────────────────────────────┤
│ 1. feature ブランチで version bump（--no-git-tag-version）  │
│ 2. PR作成（feature → main）                                  │
│ 3. CI/CD自動実行（lint, typecheck, test, build...）         │
│ 4. Quality Gate 通過                                         │
│ 5. コードレビュー & 承認                                      │
│ 6. PRマージ（Merge commit + feature ブランチ削除）          │
│    → main マージで Vercel 本番デプロイが自動実行            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 1-4: タグ作成（main）                                  │
├─────────────────────────────────────────────────────────────┤
│ 1. main ブランチに切り替え（version bump 反映済み）         │
│ 2. git tag v0.X.X                                            │
│ 3. git push origin v0.X.X                                    │
│    → create-release.yml が GitHub Release を自動作成        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 5-6: Release ノート反映 & 確認                         │
├─────────────────────────────────────────────────────────────┤
│ 1. gh release edit で詳細ノートを反映                        │
│ 2. 本番環境動作確認（デプロイは Phase 0 で実行済み）        │
│ 3. Sentryモニタリング                                        │
└─────────────────────────────────────────────────────────────┘
```

## 参考リンク

### プロジェクト内

- [versioning](./versioning.md) - バージョニングルール
- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) - CI/CD設定

### 公式ドキュメント

- [Semantic Versioning](https://semver.org/)
- [GitHub Releases](https://docs.github.com/ja/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Gitflow Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)
- [Vercel Deployments](https://vercel.com/docs/deployments/overview)

---

**種類**: 📙 リファレンス
**最終更新**: 2025-12-11
**所有者**: Dayopt 開発チーム
