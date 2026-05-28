#!/bin/bash
# PreToolUse hook: 危険な操作をブロック (exit 2 = block)
# Write/Edit/apply_patch → 対象ファイルパスをチェック
# Bash → コマンド内容チェック
#
# 注意: Codex のファイル編集は tool_name="apply_patch" / tool_input.command に
# パッチ本文が入り file_path を持たない（Write/Edit の file_path 形式ではない）。
# そのためパッチ本文から対象パスを抽出して検査する。
# apply_patch の PreToolUse 発火は Codex のバージョンにより不安定なことがある
# （openai/codex#16732, #18391）点に留意。

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# --- チェック対象ファイルパスの収集 ---
TARGET_PATHS=()
if [ -n "$FILE_PATH" ]; then
  TARGET_PATHS+=("$FILE_PATH")
fi
# apply_patch: command 内のパッチヘッダから対象パスを抽出
if [ "$TOOL_NAME" = "apply_patch" ] && [ -n "$COMMAND" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] && TARGET_PATHS+=("$p")
  done < <(echo "$COMMAND" | grep -E '^\*\*\* (Add|Update|Delete|Move to) File: ' | sed -E 's/^\*\*\* (Add|Update|Delete|Move to) File: //')
fi

check_protected_path() {
  local path="$1"

  # .env ファイル
  case "$path" in
    *.env | *.env.* | *.envrc)
      echo "BLOCKED: .env系ファイルへの書き込みは禁止です ($path)" >&2
      exit 2
      ;;
  esac

  # 既存マイグレーションファイルの変更（新規作成は許可）
  if echo "$path" | grep -q "supabase/migrations/"; then
    if [ -f "$path" ]; then
      echo "BLOCKED: 既存マイグレーションファイルの変更は禁止です。新しいマイグレーションを作成してください ($path)" >&2
      exit 2
    fi
  fi
}

# --- Write/Edit/apply_patch: 保護ファイルへの書き込みブロック ---
if [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "apply_patch" ]; then
  for p in "${TARGET_PATHS[@]}"; do
    check_protected_path "$p"
  done
fi

# --- Bash: 危険コマンドのブロック ---
if [ "$TOOL_NAME" = "Bash" ]; then
  # git push --force (--force-with-lease は許可)
  if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force[^-]|git\s+push\s+.*--force$'; then
    echo "BLOCKED: git push --force は禁止です。--force-with-lease を使ってください" >&2
    exit 2
  fi

  # git reset --hard
  if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
    echo "BLOCKED: git reset --hard は危険です。確認してください" >&2
    exit 2
  fi
fi

exit 0
