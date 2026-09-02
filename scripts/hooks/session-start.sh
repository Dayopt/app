#!/bin/bash
# SessionStart hook: セッション開始時にプロジェクト状態をコンテキストに注入
# stdoutの内容がClaudeのコンテキストに追加される
#
# cloud session（Claude Code on the web、CLAUDE_CODE_REMOTE=true）では依存の
# install も担う。container は毎回 fresh clone で node_modules が無く、
# `prepare: husky` が走るまで core.hooksPath も未設定 = pre-commit / pre-push の
# 検証層が丸ごと不在のまま commit / push できてしまう（2026-09-02 実測: clone
# 13:06 → 手動 install 完了 13:11 まで .git/config に hooksPath が無かった）。
# install は初回 ~25 秒、container state は cache されるため 2 回目以降は数秒。
# ローカル（Mac）では依存に触らない — User が管理する。
#
# 末尾の Environment 節は L0 の実行環境検証（routing skill §L0 カタログ）。
# cloud には gh / codex / op / supabase / gitleaks が無く、shell からの GitHub
# REST も proxy で通らない（#2533、3 回実測）。ctx / trace / branch:finish が
# 「未取得」を返してから気づくのではなく、最初の turn の前に機械が伝える。

echo "## Project State"
echo ""

# 現在のブランチ
BRANCH=$(git branch --show-current 2>/dev/null)
echo "**Branch**: ${BRANCH:-detached}"

# 未コミット変更
CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
echo "**Uncommitted files**: $CHANGES"

# ステージング状態
if [ "$CHANGES" -gt 0 ]; then
  echo ""
  echo "### Changes"
  git status --short 2>/dev/null
fi

echo ""
echo "### Recent commits (5)"
git log --oneline -5 2>/dev/null

# 未プッシュのコミット
UNPUSHED=$(git log --oneline @{upstream}..HEAD 2>/dev/null | wc -l | tr -d ' ')
if [ "$UNPUSHED" -gt 0 ]; then
  echo ""
  echo "**Unpushed commits**: $UNPUSHED"
fi

# --- cloud session: 依存 install（fail-safe。失敗しても session 開始は止めない） ---
DEPS_STATUS=""
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  INSTALL_LOG="${TMPDIR:-/tmp}/dayopt-session-start-install.log"
  INSTALL_START=$(date +%s)
  # hook 自体の timeout（settings.json の 300 秒）より先に自分で打ち切り、
  # 失敗を context に残せるようにする。timeout が無い環境ではそのまま実行する。
  if command -v timeout > /dev/null 2>&1; then
    timeout 240 pnpm install --frozen-lockfile < /dev/null > "$INSTALL_LOG" 2>&1
  else
    pnpm install --frozen-lockfile < /dev/null > "$INSTALL_LOG" 2>&1
  fi
  INSTALL_RC=$?
  INSTALL_SEC=$(( $(date +%s) - INSTALL_START ))
  if [ "$INSTALL_RC" -eq 0 ]; then
    DEPS_STATUS="installed (${INSTALL_SEC}s)"
  else
    DEPS_STATUS="install failed (exit ${INSTALL_RC}, ${INSTALL_SEC}s, log: ${INSTALL_LOG})"
  fi
fi

# --- 実行環境（L0: environment validation） ---
echo ""
echo "### Environment"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  REMOTE_LABEL="yes"
else
  REMOTE_LABEL="no"
fi
if [ -z "$DEPS_STATUS" ]; then
  if [ -d node_modules/.pnpm ]; then
    DEPS_STATUS="ok"
  else
    DEPS_STATUS="missing (pnpm install --frozen-lockfile)"
  fi
fi
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
NVMRC=$(cat .nvmrc 2>/dev/null | tr -d ' \n')
CLI_LINE=""
for cli in gh codex op supabase gitleaks vercel; do
  if command -v "$cli" > /dev/null 2>&1; then
    CLI_LINE="${CLI_LINE} ${cli}:yes"
  else
    CLI_LINE="${CLI_LINE} ${cli}:no"
  fi
done
echo "**remote**: ${REMOTE_LABEL} | **node**: ${NODE_VERSION} (.nvmrc: ${NVMRC:-none}) | **deps**: ${DEPS_STATUS}"
echo "**cli**:${CLI_LINE}"
if ! command -v gh > /dev/null 2>&1; then
  echo "- gh なし: \`pnpm ctx\` / \`pnpm trace\` / \`pnpm green:watch\` / \`pnpm branch:finish\` は使えない。GitHub は MCP 経由で読み書きする（#2533）"
fi
case "$DEPS_STATUS" in
  "install failed"*)
    echo "- 依存 install に失敗: pre-commit / pre-push の検証層が無い。\`pnpm install --frozen-lockfile\` を手動で実行してから commit する"
    ;;
esac
