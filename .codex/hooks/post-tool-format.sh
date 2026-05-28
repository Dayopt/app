#!/bin/bash
# PostToolUse hook: Write/Edit後にPrettierで自動フォーマット
# stdin からJSON入力を受け取り、変更されたファイルをフォーマットする

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# ファイルパスがない場合は終了
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# フォーマット対象の拡張子のみ処理
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md|*.mdx)
    npx prettier --write "$FILE_PATH" 2>/dev/null
    ;;
esac

exit 0
