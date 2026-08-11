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

  # .op-env.admin は Dayopt-Production の service role key を op run で解決する
  # 実行経路そのもの。中身は op:// 参照だけだが、存在するだけで production を
  # 触れる状態になるため作成は User の明示操作に限る。雛形の更新は許可する。
  case "$FILE_PATH" in
    *.op-env.admin.example) ;;
    *.op-env.admin)
      echo "BLOCKED: .op-env.admin は production の service role key を解決する実行経路です。作成は User の明示操作に限ります（雛形の .op-env.admin.example は編集可）" >&2
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

  # push 前の pause point は .husky/pre-push が担う（git レベルなので
  # Claude / 人間 / wrapper script のすべてに効く）。ここでは
  # その hook を外して push する抜け道だけを塞ぐ。人間が意識的に使うのは
  # 「理由付き override」として許容するが、agent は使わない。
  # コマンド位置（先頭 or セパレータ直後）に限定する。部分一致だと
  # grep / echo で言及しただけで発火してしまう。
  if echo "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+push[^;&|]*--no-verify'; then
    echo "BLOCKED: git push --no-verify は禁止です。pre-push の pause point に答えてから push してください" >&2
    exit 2
  fi

  # .op-env.admin の作成（Write/Edit ガードの Bash 側の穴を塞ぐ）。
  # 末尾の ([^.]|$) で .op-env.admin.example への一致を防ぐ。雛形を
  # コピー「元」に指定する形（cp .op-env.admin.example .op-env.admin）は
  # コピー「先」の方で落ちる。雛形の消費は下の引数ガードが別途止める。
  # 読み取り側（rg / cat など）は対象にしない。
  if echo "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*(cp|mv|touch|tee|install|ln)[[:space:]][^;&|]*\.op-env\.admin([^.]|$)'; then
    echo "BLOCKED: .op-env.admin の作成は User の明示操作に限ります（production の service role key を解決する実行経路になるため）" >&2
    exit 2
  fi
  if echo "$COMMAND" | grep -qE '>>?[[:space:]]*[^[:space:];&|]*\.op-env\.admin([^.]|$)'; then
    echo "BLOCKED: .op-env.admin への書き込みは User の明示操作に限ります（production の service role key を解決する実行経路になるため）" >&2
    exit 2
  fi

  # 雛形の直接実行。.op-env.admin.example は op://Dayopt-Production/... の参照を
  # そのまま持つため、コピーせず op run に食わせるだけで同じ本番権限が解決される。
  # 作成だけ止めても迂回できるので、消費側も塞ぐ（.example も対象に含める）。
  #
  # コマンド名ではなく「危険な引数」で判定する。op がコマンド位置に来る形だけを
  # 見ると env / command / 絶対パス / sh -c ... と迂回形をいくらでも作れるため、
  # 位置に依存せず --env-file が admin を指すこと自体を落とす。
  # 代償として、この flag と path を並べた文字列を Bash 引数に含めるだけでも
  # 発火する（docs に書く時は Write/Edit で file に書いてから渡す）。
  if echo "$COMMAND" | grep -qE '\-\-env-file[=[:space:]]+[^[:space:];&|]*\.op-env\.admin'; then
    echo "BLOCKED: .op-env.admin / .op-env.admin.example を op run に渡すのは User の明示操作に限ります（production の service role key が解決され、admin script が本番へ書き込めるため）" >&2
    exit 2
  fi

  # 上の禁止 path 判定だけでは、雛形を別名へ複製されると破れる
  # （cp .op-env.admin.example /tmp/foo → op run --env-file=/tmp/foo）。
  # path 名から中身は判別できないので、禁止を数え上げるのをやめて allowlist に
  # する。通常の local dev が使う .op-env.local だけを許可し、それ以外は
  # 中身を問わず落とす。新しい env-file を足す時はここも更新する（増やすこと
  # 自体を意図的な判断にする）。
  #
  # 保証境界: op run へ literal な path を渡す形はこれで閉じる。path を実行時に
  # 組み立てる形（変数展開・base64 など）は追わない。そこは hook ではなく
  # CLAUDE.md の EXPLICIT AUTHORITY と 1Password の承認が担う。
  if echo "$COMMAND" | grep -qE '\-\-env-file[=[:space:]]'; then
    # 判定は fail closed にする。「path らしくない token は無視する」という
    # 例外を置くと、そこが穴になる（quote / backslash escape を含む path が
    # 検査対象から外れ、空白入りの別名で迂回できた）。token を分類しようと
    # せず、.op-env.local だと言い切れる形以外はすべて落とす。
    # 代償として、flag のあとに何か語が続く文字列は散文でも落ちる。
    # basename で判定すると任意ディレクトリの同名ファイルが通る
    # （cp 雛形 /tmp/.op-env.local → その path を渡す）。path 文字列そのものを
    # allowlist にする。許可するのは repo 直下と workspace からの相対の 2 形式だけ。
    disallowed=$(echo "$COMMAND" \
      | grep -oE '\-\-env-file[=[:space:]]+[^[:space:];&|]+' \
      | sed -E 's/^--env-file[=[:space:]]+//' \
      | grep -vxE '(\.|\.\./\.\.)?/?\.op-env\.local' || true)
    if [ -n "$disallowed" ]; then
      echo "BLOCKED: op run --env-file に渡してよいのは .op-env.local だけです（指定: $(echo "$disallowed" | tr '\n' ' ')）。別名へ複製した env-file 経由で production credential を解決する迂回を塞ぐためで、必要なら User に実行を依頼してください" >&2
      exit 2
    fi
  fi
fi

exit 0
