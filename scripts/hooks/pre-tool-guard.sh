#!/bin/bash
# PreToolUse hook loader（#1961）。実際のガードロジックは pre-tool-guard-impl.sh
# に置き、このファイルは薄く保つ。理由: bash はスクリプト全体をパースしてから
# 実行するため、1 ファイル構成では構文エラーが入った瞬間、ファイル内のどんな
# コード（自己検査コードを含む）も実行されなくなる。2026-08-12 に実際に起き、
# 別セッションからの復旧が必要になった（scripts/hooks/pre-tool-guard.sh の git
# 履歴・#1961 参照）。
#
# このファイルは変更頻度を低く保つこと。ロジックの変更は impl 側で行う。
#
# 挙動: impl の構文を毎回 `bash -n` で検査し、
#   - 健全なら impl へそのまま委譲する（exit code は 0 のみ 0、他は全て 2 へ
#     写す — impl が実行時エラーで想定外の非 0 を返しても fail closed を保つ）
#   - 壊れていたら fail closed を既定にしつつ、**impl ファイル自身への
#     Write/Edit だけ**を復旧目的で例外的に通す（exit 0 + 警告）。他の
#     すべての操作（Bash 全般、他ファイルの Write/Edit、spawn_task）は
#     引き続きブロックする。例外は impl の literal path 一致のみで、
#     scripts/hooks/** のような広い glob にはしない（このガード自身が
#     「許可形は選択肢で列挙する」idiom を使っているのに合わせる）

set -u

INPUT=$(cat)
IMPL="$(dirname "${BASH_SOURCE[0]}")/pre-tool-guard-impl.sh"

SYNTAX_ERROR=$(bash -n "$IMPL" 2>&1)
if [ -n "$SYNTAX_ERROR" ]; then
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2> /dev/null || true)
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2> /dev/null || true)

  if { [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ]; } && [ "$FILE_PATH" = "$IMPL" ]; then
    echo "WARNING: pre-tool-guard-impl.sh が構文エラーで壊れています。復旧のため、この修復編集だけは通します。他の全操作は fail closed でブロックされます。エラー: $SYNTAX_ERROR" >&2
    exit 0
  fi

  echo "BLOCKED: pre-tool-guard-impl.sh が構文エラーで壊れています（fail closed）。復旧するには pre-tool-guard-impl.sh を修正してください（この Write/Edit だけは通ります）。エラー: $SYNTAX_ERROR" >&2
  exit 2
fi

printf '%s' "$INPUT" | bash "$IMPL"
rc=$?
if [ "$rc" -eq 0 ]; then
  exit 0
fi
exit 2
