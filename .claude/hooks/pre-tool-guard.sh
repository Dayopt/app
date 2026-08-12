#!/bin/bash
# PreToolUse hook: 危険な操作をブロック (exit 2 = block)
# Write/Edit → ファイルパスチェック
# Bash → コマンド内容チェック
#
# この script 自体に構文エラーがあると bash が exit 2 を返し、hook は全 tool を
# ブロックする（guard を直す編集まで塞がれて復旧できなくなる。2026-08-12 に実際に
# 起きた）。変更したら必ず `bash -n .claude/hooks/pre-tool-guard.sh` を通すこと。
# scripts/__tests__/pre-tool-guard.test.ts がこれを test として固定している。

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# op run が解決してよい 1Password vault。production の credential を解決する参照が
# local dev 用の env-file へ混ざるのを止める。禁止側（Dayopt-Production）を数え上げる
# のではなく許可側を固定するのは、vault が増えた時に穴が開かないようにするため。
ALLOWED_VAULT_PATTERN='^op://(Dayopt-Staging|Dayopt-Shared|Dayopt-Local)$'

# 渡されたテキストに含まれる op:// 参照のうち、allowlist 外の vault を返す。
# vault 名に空白が入る場合は途中で切れるが、切れた形も allowlist に一致しないので
# 落ちる（fail closed）。
disallowed_vault_refs() {
  printf '%s' "$1" \
    | grep -oE 'op://[A-Za-z0-9_.-]+' \
    | sort -u \
    | grep -vE "$ALLOWED_VAULT_PATTERN" || true
}

# --- Write/Edit: 保護ファイルへの書き込みブロック ---
if [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ]; then
  # .env ファイル（.env.example は op:// 参照スキーマの雛形で secret を含まないため許可）
  case "$FILE_PATH" in
    *.env.example) ;;
    *.env | *.env.* | *.envrc)
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

  # local dev 用の env-file へ production vault の参照が混ざるのを発生源で止める。
  # 消費側の allowlist は「どのファイルか」しか見ないため、許可 path の中身を
  # 書き換えるだけで production credential に到達できる。到達自体は下の Bash 側でも
  # 落とすが、そちらは agent が op run を直接打つ場面でしか発火しない
  # （pnpm typecheck:op などは npm script の内側で op run するので hook から見えない）。
  # 書き足しそのものをここで止める。
  # .op-env.admin.example は設計上 op://Dayopt-Production/... を持つので対象外。
  case "$FILE_PATH" in
    *.op-env.local | *.op-env.local.example)
      WRITTEN=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')
      bad_vaults=$(disallowed_vault_refs "$WRITTEN")
      if [ -n "$bad_vaults" ]; then
        echo "BLOCKED: local dev 用の env-file に許可外 vault の op:// 参照は書けません（検出: $(echo "$bad_vaults" | tr '\n' ' ')）。このファイルは op run に渡せるので、production を参照する行を足すと production credential が解決されます。管理者運用の参照は .op-env.admin.example 側に置いてください" >&2
        exit 2
      fi
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

# 渡された文字列が「1 つのことしかしないコマンド」かを判定する。
#
# guard が「この文字列はこう動く」と読めるのは、コマンドが 1 つで、実行前に別の
# ものが差し込まれない時だけ。危険な差し込み方を数え上げると尽きないので
# （実測で python3 / node / `>|` / `;` 後続 / プロセス置換がそれぞれ列挙をすり
# 抜けた）、**shell の文法上「複数のことが起きる」印**を列挙する。こちらは
# 書き手やコマンド名と違って有限で閉じている:
#   区切り            ; & | 改行
#   コマンド置換      $( ) と backtick
#   プロセス置換      <( ) と >( )
#   実行への横流し    eval
# リダイレクト（> >> <）は別のコマンドを走らせないので許す。
is_single_simple_command() {
  local s="$1" bt='`'
  case "$s" in
    *";"* | *"&"* | *"|"* | *'$('* | *"$bt"* | *'<('* | *'>('* | *"eval"*) return 1 ;;
  esac
  [[ "$s" == *$'\n'* ]] && return 1
  return 0
}

# heredoc の本文はコマンドではなくデータなので、行頭一致するコマンド検査から外す。
# 本文を落とすのは次の 2 条件を **両方** 満たす時だけ:
#   1. 導入部（<< より前）が本文を data として読むと分かっているコマンド
#   2. 導入行が単一の単純コマンド（is_single_simple_command）
# 条件 2 が要るのは、導入部だけ見ると data 消費でも本文が実行される形があるため:
#   cat <<EOF | bash                     … pipe の先で実行される
#   cat <<EOF > /tmp/x.sh; bash /tmp/x.sh … 同じ行の後続コマンドが実行する
#   eval "$(cat <<EOF                    … コマンド置換の結果が実行される
#   bash <(cat <<EOF                     … プロセス置換の中身が実行される
# 条件 1 だけで落とすと、今ブロックできている形が通るようになる（実測: 上記の
# うち pipe 以外の 3 形が main では block、条件 2 無しでは allow になった）。
# 差し込み方を 1 つずつ潰すのではなく、判定を is_single_simple_command に寄せて
# いるのは、そちらが shell の文法側で閉じているため。認識できない形は本文を残す側
# （＝誤検知が残る安全側）へ倒れる。
strip_heredoc_bodies() {
  local input="$1" out="" line trimmed intro delim=""
  local in_body=0
  local sq="'"
  # 正規表現は変数へ置いてから使う。[[ ]] の中へ直接書くと bash の tokenizer が
  # 引用符や括弧を先に解釈して構文エラーになる（2026-08-12 に踏んだ）。
  # .* を貪欲に取ることで、行内に複数ある場合は最後の << を見る。
  # <<< (here-string) は << の直後が語ではないので一致しない。
  local heredoc_re="(.*)<<-?[[:space:]]*[\"$sq]?([A-Za-z_][A-Za-z0-9_]*)"
  local data_consumer_re='(^|[[:space:];&(])(cat|tee|git|gh|jq)([[:space:]]|$)'
  while IFS= read -r line; do
    if [ "$in_body" -eq 1 ]; then
      trimmed="${line#"${line%%[![:space:]]*}"}"
      if [ "$trimmed" = "$delim" ]; then in_body=0; fi
      continue
    fi
    out+="$line"$'\n'
    if [[ $line =~ $heredoc_re ]]; then
      intro="${BASH_REMATCH[1]}"
      delim="${BASH_REMATCH[2]}"
      if is_single_simple_command "$line" && [[ $intro =~ $data_consumer_re ]]; then
        in_body=1
      fi
    fi
  done <<<"$input"
  printf '%s' "$out"
}

# 許可する env-file の path。選択肢で列挙する（optional group で組み立てると
# 区切りの / が任意になり、..op-env.local のような別名まで通る）。
ALLOWED_ENV_FILE_RE='(\.op-env\.local|\./\.op-env\.local|\.\./\.\./\.op-env\.local)'
CONFORMING_MENTION_RE="-env-file[=[:space:]]+${ALLOWED_ENV_FILE_RE}[[:space:];&|]"

# --env-file の言及がすべて許可形かを判定する。
#
# 「flag に一致したら後続 token を照合する」2 段構えだと、トリガーの正規表現に
# 一致しない書き方（--env-file"=..." のように = の前へ quote を刺す形）が照合に
# すら入らず素通りする。regex で shell の引数解釈は再現できないので、変形を
# 個別に数え上げるのをやめ、**許可形以外の言及をすべて落とす**。
#
# 判定は出現数と適合数の一致で行う。-env-file が 1 回でも現れたら、その出現が
# すべて「-env-file + =/空白 + 許可 literal + 区切り」でなければ落ちる。
env_file_mentions_conform() {
  # 末尾に区切りを足して、行末の言及も同じ形で扱う
  local s="$1 "
  local total conforming
  total=$(printf '%s' "$s" | grep -o -- '-env-file' | wc -l | tr -d ' ')
  [ "$total" -eq 0 ] && return 0
  conforming=$(printf '%s' "$s" | grep -oE -- "$CONFORMING_MENTION_RE" | wc -l | tr -d ' ')
  [ "$total" -eq "$conforming" ]
}

# 許可形を通った env-file の path を取り出す（中身の検査に使う）
conforming_env_file_paths() {
  printf '%s' "$1 " \
    | grep -oE -- "$CONFORMING_MENTION_RE" \
    | sed -E 's/^-env-file[=[:space:]]+//; s/[[:space:];&|]$//' \
    | sort -u
}

# --- Bash: 危険コマンドのブロック ---
if [ "$TOOL_NAME" = "Bash" ]; then
  # 位置ベースの検査は heredoc 本文を落とした写しに対して行う。行頭 ^ が
  # heredoc 本文の行頭にも一致するため、コミットメッセージへ書いただけで
  # 発火していた。
  COMMAND_SCANNED=$(strip_heredoc_bodies "$COMMAND")

  # git push --force (--force-with-lease は許可)
  if echo "$COMMAND_SCANNED" | grep -qE 'git\s+push\s+.*--force[^-]|git\s+push\s+.*--force$'; then
    echo "BLOCKED: git push --force は禁止です。--force-with-lease を使ってください" >&2
    exit 2
  fi

  # git reset --hard
  if echo "$COMMAND_SCANNED" | grep -qE 'git\s+reset\s+--hard'; then
    echo "BLOCKED: git reset --hard は危険です。確認してください" >&2
    exit 2
  fi

  # push 前の pause point は .husky/pre-push が担う（git レベルなので
  # Claude / 人間 / wrapper script のすべてに効く）。ここでは
  # その hook を外して push する抜け道だけを塞ぐ。人間が意識的に使うのは
  # 「理由付き override」として許容するが、agent は使わない。
  # コマンド位置（先頭 or セパレータ直後）に限定する。部分一致だと
  # grep / echo で言及しただけで発火してしまう。
  if echo "$COMMAND_SCANNED" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+push[^;&|]*--no-verify'; then
    echo "BLOCKED: git push --no-verify は禁止です。pre-push の pause point に答えてから push してください" >&2
    exit 2
  fi

  # 以降の env-file 系検査は行継続を畳んだ文字列で行う。bash は実行前に
  # `\` + 改行を除去するため、複数行に整形しただけで行単位の grep は
  # 分断されて検出できない（敵対的な回避ではなく通常の整形で起きる）。
  # 残る改行は空白へ寄せる。過剰に一致する方向なので安全側。
  # 上の force-push / reset ガードには適用しない（あちらは行頭 `^` を
  # 前提にしており、畳むと検出が弱くなる）。
  COMMAND_JOINED=${COMMAND//\\$'\n'/}
  COMMAND_JOINED=${COMMAND_JOINED//$'\n'/ }

  # quote と backslash を除いた写し。shell はこれらを引数から取り除くため、
  # flag 名の内側へ quote を刺す形（--env-f"ile"=...）は生の文字列に -env-file が
  # 現れず、この写しでしか捕まらない。両方の写しで検査してどちらかが落ちたら
  # 落とすので、判定は生の文字列だけを見る時より狭くならない。
  COMMAND_UNQUOTED=${COMMAND_JOINED//\"/}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\'/}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\\/}

  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    # .op-env.admin の作成（Write/Edit ガードの Bash 側の穴を塞ぐ）。
    # 末尾の ([^.]|$) で .op-env.admin.example への一致を防ぐ。雛形を
    # コピー「元」に指定する形（cp .op-env.admin.example .op-env.admin）は
    # コピー「先」の方で落ちる。雛形の消費は下の引数ガードが別途止める。
    # 読み取り側（rg / cat など）は対象にしない。
    if echo "$scanned" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*(cp|mv|touch|tee|install|ln)[[:space:]][^;&|]*\.op-env\.admin([^.]|$)'; then
      echo "BLOCKED: .op-env.admin の作成は User の明示操作に限ります（production の service role key を解決する実行経路になるため）" >&2
      exit 2
    fi
    if echo "$scanned" | grep -qE '>>?[[:space:]]*[^[:space:];&|]*\.op-env\.admin([^.]|$)'; then
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
    # 下の allowlist でも落ちるが、admin を名指しした時はこちらの具体的な理由を返す。
    if echo "$scanned" | grep -qE '\-\-env-file[=[:space:]]+[^[:space:];&|]*\.op-env\.admin'; then
      echo "BLOCKED: .op-env.admin / .op-env.admin.example を op run に渡すのは User の明示操作に限ります（production の service role key が解決され、admin script が本番へ書き込めるため）" >&2
      exit 2
    fi

    # 許可形以外の --env-file 言及をすべて落とす。
    #
    # 保証境界: op run へ渡す flag と path を quote / backslash escape / 行継続 /
    # 区切りの省略で書き換える形はこれで閉じる。閉じないのは、実行時に文字列を
    # 組み立てる形（変数展開・eval・base64・wrapper script・--env-$X）。そこは
    # hook ではなく CLAUDE.md の EXPLICIT AUTHORITY と 1Password の承認が担う。
    #
    # 代償として、flag のあとに何か語や引用符が続く文字列は散文でも落ちる
    # （rg -- '--env-file' のような自己検索を含む）。「閉じ引用符なら除外する」類の
    # 例外は置かない — 同型の例外（path らしくない token は無視する）が過去 2 回
    # 穴になっている。名前で検索する時は leading dash を外す
    # （rg env-file .claude/hooks/ は通る）。
    if ! env_file_mentions_conform "$scanned"; then
      echo "BLOCKED: op run --env-file に渡してよいのは通常の local dev の env-file だけです（許可形以外の言及を検出）。別名や別ディレクトリへ複製した env-file 経由で production credential を解決する迂回を塞ぐためで、必要なら User に実行を依頼してください。名前を検索したいだけなら leading dash を外してください（例: rg env-file .claude/hooks/）" >&2
      exit 2
    fi
  done

  # env-file を消費するコマンドは、**単一の単純コマンド**であることを要求する。
  #
  # hook は Bash 呼び出しごとに実行前 1 回しか発火しないので、下の中身検査は
  # コマンド実行前のファイルを読む。同じコマンドの中で先に書き換えられると、
  # 検査した中身と実際に解決される中身が別物になる
  # （echo '…' >> <env-file> && op run --env-file=<env-file> -- … ）。
  #
  # 書き込み手段を列挙する方式では閉じない。python3 / node / perl / awk の
  # ファイル書き込み、`>|` のような別形のリダイレクト、コマンド置換の中に隠す形と
  # 際限がなく、実測でも python3 / node / `>|` が列挙をすり抜けた。**書き手を
  # 数え上げるのをやめ、「別のことが起きる余地」自体を落とす**（判定は
  # is_single_simple_command）。
  #
  # 言及の有無は生の写しと quote を除いた写しの両方で見る。片方だけだと
  # --env-f"ile"=... のように flag 名の内側へ quote を刺した形が
  # 「言及なし」と判定され、この制約も下の中身検査も素通りする。
  #
  # 判定は生の $COMMAND と quote を除いた写しの両方で行う。区切りは引用符の中に
  # あっても文字としては残るので生の写しで足りるが、`e''val` のように quote で
  # 語を分断する形は除いた写しでしか見えない。
  #
  # 副作用として、cd で移動してから消費する形も落ちる。中身検査は hook の cwd から
  # path を解決するので、これが通ると検査対象と実際のファイルがずれていた。
  #
  # 代償: op run の行に他のコマンドを繋げられない（リダイレクトでのログ取りを含む）。
  # 分けて実行すれば通る。
  if printf '%s' "$COMMAND_JOINED" | grep -q -- '-env-file' \
    || printf '%s' "$COMMAND_UNQUOTED" | grep -q -- '-env-file'; then
    if ! is_single_simple_command "$COMMAND" || ! is_single_simple_command "$COMMAND_UNQUOTED"; then
      echo "BLOCKED: env-file を op run へ渡すコマンドは、単一の単純コマンドにしてください（区切り ; & | 改行、コマンド置換 \$( )、プロセス置換 <( )、eval は不可）。同じコマンドの中で env-file を書き換えられると、guard が検査した中身と実際に解決される中身が別物になるためです。書き込みや cd は別のコマンドに分けてください" >&2
      exit 2
    fi
  fi

  # 許可形を通った env-file の中身を検査する。path の allowlist は「どのファイルか」
  # しか見ないので、許可 path の中身へ production 参照を書き足せば通ってしまう。
  # ファイルが無い場合は解決される参照が無いので通す。
  #
  # 閉じない境界: path は hook の cwd から解決する。コマンド自身が cwd を変える形
  # （cd /tmp && op run --env-file=<同名ファイル> -- ...）では別のファイルが解決される。
  # 実行時に path を組み立てる形と同じ class なので hook では追わない。
  while IFS= read -r env_file_path; do
    [ -n "$env_file_path" ] || continue
    [ -f "$env_file_path" ] || continue
    bad_vaults=$(disallowed_vault_refs "$(cat "$env_file_path")")
    if [ -n "$bad_vaults" ]; then
      echo "BLOCKED: $env_file_path が許可外 vault の op:// 参照を持っています（検出: $(echo "$bad_vaults" | tr '\n' ' ')）。op run に渡すと production credential が解決されます。管理者運用は .op-env.admin 側の経路と User の明示操作で行ってください" >&2
      exit 2
    fi
  done < <(
    {
      conforming_env_file_paths "$COMMAND_JOINED"
      # quote を除いた写しからも拾う。--env-f"ile"=... は生の写しに現れない。
      conforming_env_file_paths "$COMMAND_UNQUOTED"
    } | sort -u
  )
fi

exit 0
