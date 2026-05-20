#!/bin/bash
# 前回リリース以降のマージ済みPRを取得
# Usage: ./get-merged-prs.sh [since-date]

set -e

# 前回リリースの日付を取得（指定がなければ最新タグから）
if [ -n "$1" ]; then
  SINCE_DATE="$1"
else
  LAST_TAG=$(git tag --sort=-creatordate | head -1)
  if [ -n "$LAST_TAG" ]; then
    SINCE_DATE=$(git log -1 --format=%aI "$LAST_TAG")
    echo "📅 Since last release ($LAST_TAG): $SINCE_DATE"
  else
    echo "⚠️  No previous tags found. Showing recent PRs."
    SINCE_DATE="2024-01-01T00:00:00Z"
  fi
fi

echo ""
echo "📋 Merged PRs since $SINCE_DATE:"
echo ""

# PRを取得してフォーマット
gh pr list --state merged --base main --limit 100 --json number,title,mergedAt,labels \
  | jq -r --arg since "$SINCE_DATE" '
    .[]
    | select(.mergedAt > $since)
    | "- [#\(.number)](https://github.com/Dayopt/dayopt/pull/\(.number)) - \(.title)"
  '

echo ""
echo "---"
echo "💡 Copy the above to your release notes"
