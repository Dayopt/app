#!/bin/bash
# PostToolUse hook: Write/Edit/apply_patch 後に Prettier で自動フォーマット
# stdin からJSON入力を受け取り、変更されたファイルをフォーマットする
#
# 注意: Codex のファイル編集は tool_name="apply_patch" / tool_input.command に
# パッチ本文が入り file_path を持たない。そのためパッチ本文から変更ファイルを
# 抽出してフォーマットする（apply_patch の発火は Codex バージョン依存）。

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# --- フォーマット対象ファイルパスの収集 ---
TARGET_PATHS=()
if [ -n "$FILE_PATH" ]; then
  TARGET_PATHS+=("$FILE_PATH")
fi
# apply_patch: command 内のパッチから追加・更新・移動先ファイルを抽出（削除は除外）
if [ "$TOOL_NAME" = "apply_patch" ] && [ -n "$COMMAND" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] && TARGET_PATHS+=("$p")
  done < <(echo "$COMMAND" | grep -E '^\*\*\* (Add|Update|Move to) File: ' | sed -E 's/^\*\*\* (Add|Update|Move to) File: //')
fi

# 対象がなければ終了
if [ ${#TARGET_PATHS[@]} -eq 0 ]; then
  exit 0
fi

for FP in "${TARGET_PATHS[@]}"; do
  [ -f "$FP" ] || continue
  case "$FP" in
    *.ts | *.tsx | *.js | *.jsx | *.json | *.css | *.md | *.mdx)
      npx prettier --write "$FP" 2>/dev/null
      ;;
  esac
done

exit 0
