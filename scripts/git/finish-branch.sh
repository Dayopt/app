#!/bin/bash

# PR のマージ〜掃除をワンセットで行う共通スクリプト。
# Claude / Codex / 人間が同じコマンドで実行できる。
#
#   pnpm branch:finish <PR番号> [--dry-run]
#
# 完了定義（5点すべてを満たして初めて「作業終了」）:
#   ① PR マージ済み
#   ② worktree 削除
#   ③ ローカル branch 削除
#   ④ リモート branch 消滅（fetch --prune で確認）
#   ⑤ main checkout が最新
#
# 詳細な設計と手動フォールバックは .claude/rules/workflow.md §Worktree 運用 を参照。

set -euo pipefail

DRY_RUN=false
PR_NUMBER=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    -h | --help)
      cat <<'EOF'
Usage: pnpm branch:finish <PR番号> [--dry-run]

PR をマージし、worktree・ローカル branch・リモート branch を掃除して main を最新化する。

  <PR番号>     掃除対象の Pull Request 番号（必須）
  --dry-run    実際には変更せず、実行予定のアクションだけ表示する
EOF
      exit 0
      ;;
    *)
      if [[ -z "$PR_NUMBER" ]]; then
        PR_NUMBER="$arg"
      else
        echo "❌ 引数が多すぎます: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

error() {
  echo "❌ $1" >&2
}

info() {
  echo "ℹ️  $1" >&2
}

step() {
  echo "" >&2
  echo "▶ $1" >&2
}

# --dry-run 時はコマンドを実行せず表示だけする
run() {
  if [[ "$DRY_RUN" == true ]]; then
    echo "   [dry-run] $*" >&2
  else
    "$@"
  fi
}

if [[ -z "$PR_NUMBER" ]]; then
  error "PR 番号を指定してください: pnpm branch:finish <PR番号> [--dry-run]"
  exit 1
fi

if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  error "PR 番号は数値で指定してください（受け取った値: $PR_NUMBER）"
  exit 1
fi

for bin in git gh; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    error "$bin が見つかりません。"
    exit 1
  fi
done

# repo のルート（main checkout）を git-common-dir から解決する。
# worktree の中から実行しても main checkout を正しく指す。
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
MAIN_ROOT="$(cd "$(dirname "$GIT_COMMON_DIR")" && pwd)"

if [[ "$DRY_RUN" == true ]]; then
  info "dry-run モード: 変更は行いません"
fi

# ── 1. PR 状態を取得 ────────────────────────────────────────────────
step "PR #$PR_NUMBER の状態を確認"

PR_JSON="$(gh pr view "$PR_NUMBER" --json state,headRefName,mergeable,mergeStateStatus,statusCheckRollup 2>/dev/null || true)"

if [[ -z "$PR_JSON" ]]; then
  error "PR #$PR_NUMBER を取得できませんでした。番号とネットワークを確認してください。"
  exit 1
fi

PR_STATE="$(printf '%s' "$PR_JSON" | jq -r '.state')"
BRANCH="$(printf '%s' "$PR_JSON" | jq -r '.headRefName')"

if [[ -z "$BRANCH" || "$BRANCH" == "null" ]]; then
  error "PR #$PR_NUMBER の head branch を特定できませんでした。"
  exit 1
fi

info "branch: $BRANCH / state: $PR_STATE"

if [[ "$PR_STATE" == "CLOSED" ]]; then
  info "PR は CLOSED（未マージ）です。branch 掃除のみ続行します。"
fi

# ── 2. 未マージなら checks を確認してマージ ──────────────────────────
if [[ "$PR_STATE" == "OPEN" ]]; then
  step "PR #$PR_NUMBER をマージ"

  # 失敗している check がないか確認する（CheckRun は .conclusion、StatusContext は .state を持つ）
  FAILED_CHECKS="$(printf '%s' "$PR_JSON" | jq -r '
    (.statusCheckRollup // [])
    | map(select(
        ((.conclusion // "") | ascii_downcase | . == "failure" or . == "cancelled" or . == "timed_out")
        or ((.state // "") | ascii_downcase | . == "failure" or . == "error")
      ))
    | length')"

  if [[ "$FAILED_CHECKS" != "0" ]]; then
    error "失敗している check が $FAILED_CHECKS 件あります。マージを中止します。"
    error "gh pr checks $PR_NUMBER で詳細を確認してください。"
    exit 1
  fi

  # branch が main の最新を含んでいるか確認する（up-to-date gate）。
  # CI は PR 側でしか走らせないため、古い main ベースのままマージすると
  # 「A・B 単体では green だが合わせると壊れる」マージ順衝突を検知できない。
  # branch protection の strict mode 相当をここで代替する。
  BASE_STATUS="$(gh api "repos/{owner}/{repo}/compare/main...$BRANCH" --jq '.status' 2>/dev/null || echo unknown)"
  if [[ "$BASE_STATUS" != "ahead" && "$BASE_STATUS" != "identical" ]]; then
    error "branch が main の最新を含んでいません（compare status: $BASE_STATUS）。"
    error "main を取り込んで push し、CI green を待ってから再実行してください:"
    error "  git fetch origin && git merge origin/main && git push"
    exit 1
  fi

  # 実行中・待機中の check も待つ。private repo + Free plan では GitHub 側の
  # required check 強制が効かないため、ここで止めないと CI 完了前にマージできてしまう。
  PENDING_CHECKS="$(printf '%s' "$PR_JSON" | jq -r '
    (.statusCheckRollup // [])
    | map(select(
        ((.status // "") | ascii_downcase | . == "in_progress" or . == "queued" or . == "pending" or . == "waiting" or . == "requested")
        or ((.state // "") | ascii_downcase | . == "pending")
      ))
    | length')"

  if [[ "$PENDING_CHECKS" != "0" ]]; then
    error "実行中の check が $PENDING_CHECKS 件あります。完了を待ってから再実行してください。"
    error "gh pr checks $PR_NUMBER --watch で完了を待てます。"
    exit 1
  fi

  # 検証が実際に行われたことを確認する。statusCheckRollup が空、または全ての
  # check が skipped の場合、上の failure / pending 判定はどちらも 0 件になり
  # 「CI が 1 本も走っていない PR」を green と区別できないまま素通りする。
  # private repo + Free plan では GitHub 側の required check 強制が効かないため、
  # ここが唯一の防波堤になる。
  #
  # ci.yml は docs のみの変更なら paths-ignore で skip されるので、「CI が
  # 走らない PR」自体は異常ではない。ただし Docs Guard は paths フィルタを持たず
  # 全 PR で走るため、success が 1 件も無い状態は構成の異常を意味する。
  SUCCESS_CHECKS="$(printf '%s' "$PR_JSON" | jq -r '
    (.statusCheckRollup // [])
    | map(select(
        ((.conclusion // "") | ascii_downcase | . == "success")
        or ((.state // "") | ascii_downcase | . == "success")
      ))
    | length')"

  if [[ "$SUCCESS_CHECKS" == "0" ]]; then
    error "成功した check が 1 件もありません。マージを中止します。"
    error "CI が未登録、全て skip、または check 登録前の可能性があります。"
    error "gh pr checks $PR_NUMBER で状態を確認してください。"
    exit 1
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "   [dry-run] gh pr merge $PR_NUMBER --merge --delete-branch" >&2
  else
    # main が他 worktree で checkout 中だと gh pr merge が失敗しうる。
    # その場合は gh api で直接マージにフォールバックする。
    if ! gh pr merge "$PR_NUMBER" --merge --delete-branch 2>/tmp/branch-finish-merge-err; then
      cat /tmp/branch-finish-merge-err >&2 || true
      info "gh pr merge が失敗しました。gh api での直接マージを試みます。"
      REPO="$(gh repo view --json nameWithOwner -q '.nameWithOwner')"
      gh api -X PUT "repos/$REPO/pulls/$PR_NUMBER/merge" -f merge_method=merge >/dev/null
      info "gh api でマージしました。リモート branch を削除します。"
      gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH" >/dev/null 2>&1 || true
    fi
    rm -f /tmp/branch-finish-merge-err
  fi
else
  info "PR は既にクローズ済みのためマージ手順はスキップします。"
fi

# ── 3. 該当 branch の worktree を特定 ────────────────────────────────
step "worktree を特定"

# `git worktree list --porcelain` を解析し branch が一致する worktree path を得る
WORKTREE_PATH="$(git worktree list --porcelain | awk -v br="refs/heads/$BRANCH" '
  /^worktree / { path = substr($0, 10) }
  /^branch / && $2 == br { print path; exit }
')"

if [[ -n "$WORKTREE_PATH" ]]; then
  info "worktree: $WORKTREE_PATH"
else
  info "この branch に紐づく worktree はありません。"
fi

# ── 4. worktree の dirty 確認 ───────────────────────────────────────
if [[ -n "$WORKTREE_PATH" ]]; then
  step "worktree の未コミット差分を確認"

  DIRTY="$(git -C "$WORKTREE_PATH" status --porcelain 2>/dev/null || true)"

  if [[ -n "$DIRTY" ]]; then
    # tracked ファイルの差分があるかを判定する。
    # gitignore された生成物（--porcelain には出ない）ではなく、
    # tracked の変更や未追跡ファイルが残っている場合はユーザー作業として扱う。
    error "worktree に未コミットの差分があります。掃除を中止します。"
    error "内容を確認してください: git -C \"$WORKTREE_PATH\" status"
    printf '%s\n' "$DIRTY" | sed 's/^/    /' >&2
    exit 1
  fi

  info "差分なし。削除して問題ありません。"
fi

# ── 5. worktree 削除 ────────────────────────────────────────────────
if [[ -n "$WORKTREE_PATH" ]]; then
  step "worktree を削除"
  # gitignore された生成物（.next/ 等）だけが残って remove が拒否される場合に備え、
  # dirty 確認（step 4）を通過している前提で --force を付ける。
  run git worktree remove --force "$WORKTREE_PATH"
fi

# ── 6. main を最新化（branch 削除より先に行う） ─────────────────────
# gh pr merge はリモートのみ更新するため、この時点ではローカル main に
# マージコミットが無い。先に fetch + pull して main を最新化しておくと、
# マージコミットの第2親 = branch 先端がローカル main から辿れるようになり、
# 続く `git branch -d` が「マージ済み」と判定して確実に成功する。
# （Claude Code の worktree branch は upstream 追跡が無いことが多く、
#  pull 前に -d すると not fully merged で誤って失敗する）
step "main を最新化"

run git -C "$MAIN_ROOT" fetch --prune origin
run git -C "$MAIN_ROOT" checkout main
run git -C "$MAIN_ROOT" pull --ff-only origin main

# ── 7. ローカル branch を削除 ───────────────────────────────────────
step "ローカル branch を削除"

if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  # -d は merge 済みなら成功する。not fully merged なら失敗させて停止する（-D は使わない）。
  if [[ "$DRY_RUN" == true ]]; then
    echo "   [dry-run] git -C \"$MAIN_ROOT\" branch -d $BRANCH" >&2
  elif ! git -C "$MAIN_ROOT" branch -d "$BRANCH" 2>/tmp/branch-finish-branch-err; then
    cat /tmp/branch-finish-branch-err >&2 || true
    rm -f /tmp/branch-finish-branch-err
    error "branch '$BRANCH' は未マージ扱いで削除できませんでした。"
    error "main を pull 済みか、本当にマージ済みかを確認してください（-D 強制は避ける）。"
    exit 1
  fi
  rm -f /tmp/branch-finish-branch-err
else
  info "ローカル branch '$BRANCH' は既にありません。"
fi

# ── 8. リモート branch の消滅を確認 ─────────────────────────────────
# step 6 の fetch --prune で origin/<branch> は消えているはず。
# 万一 --delete-branch が効かず残っていれば明示的に削除する。
step "リモート branch を確認"

if [[ "$DRY_RUN" == false ]]; then
  if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    info "リモートに origin/$BRANCH が残っています。削除します。"
    git -C "$MAIN_ROOT" push origin --delete "$BRANCH" || \
      error "リモート branch の削除に失敗しました。手動で確認してください。"
  else
    info "リモート branch は消滅済みです。"
  fi
fi

# ── 9. 孤児化した worktree 管理情報を掃除 ───────────────────────────
run git -C "$MAIN_ROOT" worktree prune

# ── 10. サマリー ────────────────────────────────────────────────────
step "完了"

if [[ "$DRY_RUN" == true ]]; then
  info "dry-run のため実際の変更は行っていません。"
else
  echo "✅ PR #$PR_NUMBER を片付けました:" >&2
  echo "   - branch: $BRANCH（ローカル / リモートとも削除）" >&2
  [[ -n "$WORKTREE_PATH" ]] && echo "   - worktree: $WORKTREE_PATH（削除）" >&2
  echo "   - main HEAD: $(git -C "$MAIN_ROOT" rev-parse --short main)" >&2
fi

echo "" >&2
echo "残っている worktree:" >&2
git -C "$MAIN_ROOT" worktree list >&2
