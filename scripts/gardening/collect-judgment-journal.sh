#!/bin/bash
# 判断ジャーナル（judgment:diverged / judgment:judged ラベル）月次棚卸しの下ごしらえ。
#
# `.claude/rules/orchestration.md` §判断ジャーナル / `.claude/skills/gardening/SKILL.md`
# 人間パート④-⑤ が定める手順のうち、機械的な部分（現在ラベルが付いている全 issue / PR の
# 列挙）だけを自動化する。**「どちらの判断が正しかったか」の判定コメント作成・ラベル付け替え・
# ラベル解除は人間 + 指揮台の価値判断であり、このスクリプトの scope 外。** 一覧を出すところ
# までが仕事。
#
# 2 ラベルを分けて列挙する理由（2026-08-27、#2423 の個別判定前倒しに伴い #2445 で追加。
# User 裁可の記録は `.claude/rules/orchestration.md` §判断ジャーナル）:
# - `judgment:diverged` — 分岐を記録した時点（未判定 or 判定材料待ち）。次に要るのは判定
# - `judgment:judged`   — 個別判定を書き終え、月次 `pnpm decisions:sync` 待ちの状態。
#   次に要るのは sync + ラベル解除（新しい判定コメントは不要）
#
# 使い方: pnpm gardening:judgment-journal

set -euo pipefail

REPO="Dayopt/dayopt"

if ! command -v gh >/dev/null 2>&1; then
  echo "エラー: gh CLI が見つかりません。https://cli.github.com/ を参照してください。" >&2
  exit 1
fi

count_label() {
  gh search issues --repo "$REPO" --label "$1" --include-prs --limit 200 --json number --jq 'length'
}

list_label() {
  gh search issues --repo "$REPO" --label "$1" --include-prs --limit 200 \
    --json number,title,url,updatedAt,isPullRequest \
    --jq 'sort_by(.updatedAt) | .[] | "| #\(.number) | \(if .isPullRequest then "PR" else "issue" end) | \(.title) | \(.updatedAt[:10]) | \(.url) |"'
}

echo "# 判断ジャーナル棚卸し（$(date '+%Y-%m-%d') 時点）"
echo ""

DIVERGED_COUNT=$(count_label judgment:diverged)
JUDGED_COUNT=$(count_label judgment:judged)

echo "## judgment:diverged（未判定 or 判定材料待ち）: ${DIVERGED_COUNT} 件"
echo ""
if [ "$DIVERGED_COUNT" -gt 0 ]; then
  echo "| # | 種別 | タイトル | 最終更新 | URL |"
  echo "| --- | --- | --- | --- | --- |"
  list_label judgment:diverged
  echo ""
  echo "各行について: 該当 issue / PR のコメントを開き、分岐コメント（推奨・User 判断・理由・観点）と"
  echo "現時点の観測結果を突き合わせる。観測できた事例には判定コメントを追記して"
  echo "\`gh issue edit <番号> --remove-label judgment:diverged --add-label judgment:judged\` で付け替える。"
  echo "未観測の事例はラベルを残し、翌月へ持ち越す。"
else
  echo "現在 judgment:diverged ラベルが付いている issue / PR はありません。"
fi
echo ""

echo "## judgment:judged（判定済み・月次 sync 待ち）: ${JUDGED_COUNT} 件"
echo ""
if [ "$JUDGED_COUNT" -gt 0 ]; then
  echo "| # | 種別 | タイトル | 最終更新 | URL |"
  echo "| --- | --- | --- | --- | --- |"
  list_label judgment:judged
  echo ""
  echo "\`pnpm decisions:sync\` を実行して docs/decisions.md へ反映した後（先にラベルを外さない —"
  echo "外すと append-only の全履歴から永久に欠落する）、これらの issue / PR から"
  echo "\`gh issue edit <番号> --remove-label judgment:judged\` でラベルを外す。"
else
  echo "現在 judgment:judged ラベルが付いている issue / PR はありません。"
fi
