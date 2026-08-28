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
- 指揮台の朝の promote 提案（`.claude/rules/orchestration.md` §1 日サイクル「朝: 編成」）に User が「流す」と応答した時。提案自体は権限を持たず、release 実行はここから通常の Phase に従う

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
│  └─ Phase 1 から: promote 完了確認 → 観察 → タグ作成・push → リリースノート
│     （Production Release status が success になるまでタグを打たない）
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

Phase 1: Production公開の確認とタグ作成（mainブランチ）
  ├── 1.1 mainブランチ最新取得
  ├── 1.2 Production Release の promote 完了を待つ
  ├── 1.3 Production を観察する（主要route / Sentry）
  ├── 1.4 Gitタグ作成・プッシュ（promote成功の証跡）
  └── 1.5 GitHub Release作成の確認（auto-generated notes）

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

### Phase 1.2: Production promote を手動 dispatch し、完了を待つ

main への merge は Product / Web の Production build を作るだけで、Production domain は切り替わらない。`release.yml` は `push: main` トリガーを持たず **`workflow_dispatch` のみ**で起動する（2026-08-20、#2268）。merge しても自動では走らないため、ここで明示的に dispatch する。**production への操作のため `EXPLICIT AUTHORITY`（ユーザー明示指示）が必要。**

**promote 前に層 3（E2E / Web E2E / Integration Tests）が main HEAD の SHA で green か確認する**（2026-08-25、#2382）。`heavy-post-merge.yml` は per-merge 実行を廃止し nightly + 手動発火のみになったため、main HEAD が直近の nightly 実行 SHA より進んでいる（nightly 後に merge があった）のが通常運用になる。`release.yml` の層 4 gate は **target SHA ちょうど**の check-runs しか見ないため、この確認を省くと gate で止まる:

```bash
# main HEAD に層 3 の 3 check がすべて success で付いているか確認する
gh api "repos/Dayopt/dayopt/commits/$(git rev-parse origin/main)/check-runs" \
  --jq '.check_runs[] | select(.name == "🎭 E2E Tests" or .name == "🌐 Web Build & E2E" or .name == "Integration Tests") | "\(.name): \(.conclusion)"'
```

3 check すべて `success` なら Phase 1.2 の dispatch へ進む。**不足・pending・古い SHA の場合は日中の手動発火**で層 3 を先に main HEAD へ揃える（`heavy-post-merge.yml` は per-merge 実行が無いため常に必要、`integration.yml` は DB / migration / RLS 系ファイルを触った merge なら push:main で既に走っている場合がある — 上記コマンドで確認済みなら省略可）。

**`gh run list --limit 1` を dispatch 直後にそのまま使わない。** `gh workflow run` は run が Actions 側へ登録される前に返るため、`--limit 1` は**まだ存在しない新 run ではなく前夜の nightly（conclusion=success）を返しうる**。その id を `gh run watch --exit-status` へ渡すと完了済み run に対して即座に exit 0 が返り、「層 3 を green にした」と誤認したまま promote へ進んでしまう（実際には何も走っておらず層 4 gate で止まる）。`--event` / `--branch` で絞り、**headSha が main HEAD と一致すること**を確認してから watch する:

**このブロックは頭から通しで実行する**（`MAIN_SHA` の取得を含む）。途中だけを別シェルへ貼ると `MAIN_SHA` が空になり、run を永久に特定できずに終わる。`WF` を差し替えて 2 回実行する（`heavy-post-merge.yml` → `integration.yml`）。**2 回目の実行前に、1 回目と同じ `MAIN_SHA` であることを確認する**（`echo "$MAIN_SHA"` で見比べる、または再度 `git fetch origin main` してから `git rev-parse origin/main` を突き合わせる）。間に他レーンの merge が入って main が進んでいたら、両方のブロックを最初からやり直す（片方だけ新しい SHA を検証した状態で層 4 gate に進まないため）。

```bash
git fetch origin main                      # MAIN_SHA を確実に最新へ
MAIN_SHA="$(git rev-parse origin/main)"
WF=heavy-post-merge.yml                    # 2 本目は integration.yml に差し替えて再実行

# dispatch 前の最新 run id を控える。これより新しい run だけを受け入れることで、
# 「同じ main HEAD に対する過去の dispatch」（再 dispatch / promote 中断後の再開）を
# 掴んでしまう経路を塞ぐ。headSha 一致だけでは旧 run と区別できない。
BEFORE_ID="$(gh run list --workflow="$WF" --event=workflow_dispatch --branch=main \
  --limit 1 --json databaseId --jq '.[0].databaseId // 0')"
case "$BEFORE_ID" in
  ''|*[!0-9]*) echo "gh run list に失敗しました（認証切れ・ネットワークを確認）"; BEFORE_ID=0 ;;
esac

gh workflow run "$WF" --ref main

# run が Actions 側に現れるまで待つ（`gh workflow run` は登録前に返る）。
RUN_ID=""
for _ in $(seq 1 10); do
  RUN_ID="$(gh run list --workflow="$WF" --event=workflow_dispatch --branch=main \
    --limit 5 --json databaseId,headSha \
    | jq -r --arg sha "$MAIN_SHA" --argjson before "$BEFORE_ID" \
        '[.[] | select(.headSha == $sha and .databaseId > $before)] | .[0].databaseId // empty')"
  [ -n "$RUN_ID" ] && break
  sleep 5
done

if [ -n "$RUN_ID" ]; then
  gh run watch --exit-status "$RUN_ID"
else
  echo "dispatch した run を特定できません。MAIN_SHA=$MAIN_SHA が main HEAD と一致しているか（git fetch origin main 済みか）を確認し、Actions 画面で直接見る"
fi
```

両方の完了後は、**冒頭の check-runs 確認コマンドを再実行**して 3 check すべての `success` を確かめる。`gh run watch` の結果ではなくこちらを最終判断に使う — **層 4 gate が実際に見るものと同じ**なので確実。

`workflow_dispatch` でも check-run は commit へ正しく付く（2026-08-25 実測、#2382）ため、手動発火の green で層 4 gate は成立する。

### 層 3 が走っていない過去 SHA を promote したい時

`release.yml` は `sha` input で main HEAD より古い SHA を promote できる。その SHA に層 3 の check-run が無い場合、**一時 tag を経由して実テストを走らせられる**（`force` に倒す前に必ずこちらを試す）:

```bash
TARGET=<promote したい 40-hex SHA>
git fetch origin "$TARGET" 2>/dev/null || git fetch origin main  # ローカルに無ければ取得
TAG="tmp-layer3-$(git rev-parse --short "$TARGET")"              # 以降 $TAG で統一（再評価しない）

git tag "$TAG" "$TARGET"
git push origin "$TAG"
sleep 3  # ref の伝播待ち（push 直後の dispatch は 422 になることがある）
gh workflow run heavy-post-merge.yml --ref "$TAG"
gh workflow run integration.yml --ref "$TAG"
# 完了後、check-runs 確認コマンドの $(git rev-parse origin/main) を $TARGET に置き換えて 3 check の success を確認

# 確認できたら（成功・失敗どちらでも）tag を削除する
git push origin --delete "$TAG"
git tag -d "$TAG"
```

**2026-08-25 実測**: `gh workflow run --ref` は 40-hex SHA を `HTTP 422: No ref found for: <sha>` で拒否するが、**tag は受け付ける**。tag ref で起動した run は `headSha` が tag 先の commit になり、check-run もその commit へ付く（層 4 gate は `commits/$RELEASE_SHA/check-runs` を見るので ref の種類に依存しない）。tag ref は concurrency group も main と別になるため、走行中の main run を巻き込まない。

**この経路が成立するのは、TARGET の tree に `heavy-post-merge.yml` / `integration.yml` が存在し、かつ job 名が層 4 gate の `required_checks`（🎭 E2E Tests / 🌐 Web Build & E2E / Integration Tests）と一致する場合に限る。** dispatch は tag 先 commit の workflow 定義で走るため、CI 4 層再設計（2026-08-20、#2269）より前の SHA では該当ファイルが存在せず dispatch 自体が失敗するか、存在しても job 名が当時のものと食い違い gate を通らない可能性がある（未検証）。したがって **実テストを走らせる道が残っているのは #2269 以降の SHA に限られる**。`force` は層 4 gate だけでなく smoke と Production Config Audit も同時に skip するため、対象 SHA が該当するなら上記を試した上での最後の手段として扱う。

```bash
# Production promote を手動 dispatch する（sha 省略時は main の最新 commit）。
# --ref は付けない。release script は常に main のものを使う（runbook.md 参照）。
gh workflow run release.yml

# 実行状況を確認
gh run list --workflow=release.yml --limit 1
gh run watch --exit-status

# 対象 SHA が Production に出たことを確認
gh api "repos/Dayopt/dayopt/commits/$(git rev-parse HEAD)/status" \
  --jq '.statuses[] | select(.context == "Production Release") | .state'
```

`success` にならないうちはタグを打たない。失敗時は `docs/operations/runbook.md` の Playbook 2 に従う。

### Phase 1.3: Production を観察する

promote 直後に主要 route と監視を確認する。異常があればタグを打たず、runbook の rollback 手順へ移る。

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dayopt.app/
curl -s -o /dev/null -w "%{http_code}\n" https://app.dayopt.app/api/health
```

Sentry の新規 issue と Vercel の runtime log も確認する。

### Phase 1.4: Gitタグ作成・プッシュ

観察まで終わってからタグを打つ。タグは deploy trigger ではなく、Production 公開が成功した証跡である。

```bash
git tag v${VERSION}
git push origin v${VERSION}
```

`create-release.yml` はタグ SHA の `Production Release` status が `success` であることを確認してから GitHub Release を作成する。未 promote の SHA にタグを打つと、この検証で止まる。

### Phase 1.5: Release 作成の確認

```bash
gh run list --workflow=create-release.yml --limit 1
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

**構造テンプレート**: `docs/operations/runbook.md` を参照

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

カテゴリは `docs/operations/runbook.md` 第4部「リリースノート執筆規約」の5分類に従う（Web版リリースノート `docs-writing` skill とも共通のタクソノミー。ここでは再定義しない）:

1. **新機能**: 機能名 + 具体的な実装内容。**Storybook-only（本番コードからの呼び出し元が無い）変更は「新機能」に書かない**（策定日: 2026-08-28、[#2442](https://github.com/Dayopt/dayopt/issues/2442)）。対象 component/関数を `rg` し、`*.stories.tsx` や自 feature 内以外からの呼び出しが無ければ Storybook-only と判定する。どうしても記載する場合は「Storybook 上のみ・本番未接続」と明記し、ユーザーには見えないことを分かる形にする。2026-08-27、Storybook-only の [PR #2413](https://github.com/Dayopt/dayopt/pull/2413) を新機能として記載し、User が本番で探して見つからない実害が発生した
2. **改善**: 何がどう変わったか + 影響範囲（パフォーマンス最適化を含む）
3. **バグ修正**: 問題の原因 + 修正内容
4. **破壊的変更**: DB変更、削除されたAPI/コンポーネント
5. **セキュリティ**: セキュリティ関連の対応

#### Step 4: GitHub Release に反映

```bash
# 一時ファイルにリリースノートを書き出してから反映
gh release edit v${VERSION} --notes-file /tmp/release-notes-v${VERSION}.md
```

#### Step 5: Web 公開リリースノート

エンドユーザー向けの Web 版リリースノートは、`docs-writing` skill で `apps/web/content/blog/{en,ja}/` に `category: 'release'` の blog 記事として作成する（`/blog/release` タブに表示。独立した releases ページは持たない）。GitHub Release 本文と同じ5分類タクソノミーを使い、PR リンクを含めず平易な言葉で書く。

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

#### Phase 3.1: milestone の締めと次の開設（minor リリース時のみ）

milestone は「次の minor version」を単位に常に 1 個だけ open にする運用（経緯は [2026-08-09-milestone-versioning.md](../../../docs/engineering/log/2026-08-09-milestone-versioning.md)）。minor リリースを出したらここで世代交代する。patch リリースでは何もしない。

```bash
# リリースした version の milestone を閉じる（open issue が残っていれば次へ移す）
gh api repos/Dayopt/dayopt/milestones --jq '.[] | select(.title=="vX.Y") | .number'
gh api -X PATCH repos/Dayopt/dayopt/milestones/<number> -f state=closed

# 次の minor の milestone を開く
gh api repos/Dayopt/dayopt/milestones -f title="vX.Y+1"
```

- 閉じる前に open のまま残った issue は、自動で外れないため**明示的に次の milestone へ移すか、milestone を外してバックログへ戻す**
- 閉じる時に「この束は外部共有（blog release 記事）に値するか」を一言添えてユーザーに判断を仰ぐ。義務ではなく判断ベース（`docs/business/content/content-operations.md` §更新の連鎖）

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

完全なチェックリスト: `docs/operations/runbook.md`
