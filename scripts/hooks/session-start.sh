#!/bin/bash
# SessionStart hook: セッション開始時にプロジェクト状態をコンテキストに注入
# stdoutの内容がClaudeのコンテキストに追加される

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
