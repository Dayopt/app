#!/bin/bash
# PreToolUse hook: 危険な操作をブロック (exit 2 = block)
# Write/Edit → ファイルパスチェック
# Bash → コマンド内容チェック

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# --- Write/Edit: 保護ファイルへの書き込みブロック ---
if [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ]; then
  # .env ファイル（.env.example は op:// 参照スキーマの雛形で secret を含まないため許可）
  case "$FILE_PATH" in
    *.env.example) ;;
    *.env|*.env.*|*.envrc)
      echo "BLOCKED: .env系ファイルへの書き込みは禁止です" >&2
      exit 2
      ;;
  esac

  # 既存マイグレーションファイルの変更（新規作成は許可）
  if echo "$FILE_PATH" | grep -q "supabase/migrations/"; then
    if [ -f "$FILE_PATH" ]; then
      echo "BLOCKED: 既存マイグレーションファイルの変更は禁止です。新しいマイグレーションを作成してください" >&2
      exit 2
    fi
  fi
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

  # --- pause point: push 前の DO-CONFIRM ---
  # 現在の commit set について一度だけ止め、killer item を提示する。
  # 「知っていたのに、その瞬間に確認しなかった」型の事故を防ぐのが目的で、
  # 再実行すれば通る（止めること自体が目的ではなく、発話を transcript に
  # 残すことが目的）。項目は実際に事故になった履歴があるものだけ。
  # 追加する時は 1 つ削る。検証は /gardening のステップ 5。
  # コマンド位置（先頭 or セパレータ直後）に限定する。部分一致だと
  # grep / echo で "git push" に言及しただけで発火してしまう。
  if echo "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+push'; then
    HEAD_SHA=$(git rev-parse HEAD 2>/dev/null || echo unknown)
    MARKER_DIR="$(git rev-parse --git-dir 2>/dev/null || echo .git)/dayopt-push-confirm"
    if [ ! -f "$MARKER_DIR/$HEAD_SHA" ]; then
      mkdir -p "$MARKER_DIR" && : > "$MARKER_DIR/$HEAD_SHA"
      cat >&2 <<'CONFIRM'
PAUSE: push 前の確認（この commit set では初回。答えてから再実行する）

1. index は意図どおりか（git diff --cached を見たか。Edit が working tree
   だけに残る事故が過去にある）
2. 直前の修正コミットが新しい穴を開けていないか（指摘対応コミット自体が
   回帰を作る事例が PR #1712 / #1738 で繰り返している）
3. auth / RLS / billing / migration / 公開契約 / cross-feature を含む diff か。
   含むなら risk-reviewer / behavior-verifier / architecture-guard へ反証を
   かけたか（.claude/rules/ai-behavior.md §Read-only delegation）
4. 配線は繋がっているか（workflow ↔ script の env 受け渡し、定数間の
   不等式: timeout / 予算）
5. 同じ値を 2 箇所に置いていないか（複製した hex が片方だけ古く、
   ブランド色が紫のまま OG 画像で外に出ていた）
6. 推測で結論した箇所はないか。測れるものは測ったか（色域外を
   「知覚差なし」と判断していた例がある）

該当なしの項目は「該当なし」と言い切る。黙って通さない。
CONFIRM
      exit 2
    fi
  fi
fi

exit 0
