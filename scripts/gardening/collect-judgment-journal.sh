#!/bin/bash
# 判断ジャーナル（judgment:diverged ラベル）月次棚卸しの下ごしらえ。
#
# `.claude/rules/orchestration.md` §判断ジャーナル / `.claude/skills/gardening/SKILL.md`
# 人間パート③-④ が定める手順のうち、機械的な部分（現在ラベルが付いている全 issue / PR の
# 列挙）だけを自動化する。**「どちらの判断が正しかったか」の判定コメント作成とラベル解除は
# 人間 + 指揮台の価値判断であり、このスクリプトの scope 外。** 一覧を出すところまでが仕事。
#
# 使い方: pnpm gardening:judgment-journal

set -euo pipefail

REPO="Dayopt/dayopt"

if ! command -v gh >/dev/null 2>&1; then
  echo "エラー: gh CLI が見つかりません。https://cli.github.com/ を参照してください。" >&2
  exit 1
fi

echo "# 判断ジャーナル棚卸し（$(date '+%Y-%m-%d') 時点、label: judgment:diverged）"
echo ""

COUNT=$(gh search issues --repo "$REPO" --label judgment:diverged --include-prs --limit 200 --json number --jq 'length')

if [ "$COUNT" -eq 0 ]; then
  echo "現在 judgment:diverged ラベルが付いている issue / PR はありません。"
  exit 0
fi

echo "対象: ${COUNT} 件"
echo ""
echo "| # | 種別 | タイトル | 最終更新 | URL |"
echo "| --- | --- | --- | --- | --- |"

gh search issues --repo "$REPO" --label judgment:diverged --include-prs --limit 200 \
  --json number,title,url,updatedAt,isPullRequest \
  --jq 'sort_by(.updatedAt) | .[] | "| #\(.number) | \(if .isPullRequest then "PR" else "issue" end) | \(.title) | \(.updatedAt[:10]) | \(.url) |"'

echo ""
echo "各行について: 該当 issue / PR のコメントを開き、分岐コメント（推奨・User 判断・理由・観点）と"
echo "現時点の観測結果を突き合わせる。観測できた事例には判定コメントを追記して \`gh issue edit <番号> --remove-label judgment:diverged\` でラベルを外す。"
echo "未観測の事例はラベルを残し、翌月へ持ち越す。"
