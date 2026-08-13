#!/bin/bash
# PreToolUse hook の実ロジック（exit 2 = block）。呼び出し元は薄い loader
# （.claude/hooks/pre-tool-guard.sh、#1961）で、settings.json はそちらを登録する。
# Write/Edit → ファイルパスチェック
# Bash → コマンド内容チェック
#
# この script 自体に構文エラーがあると bash -n が失敗を検出し、loader が
# fail closed へ倒す（復旧のためこのファイルへの Write/Edit だけは例外的に通す。
# 詳細は loader 側のコメント）。変更したら必ず
# `bash -n .claude/hooks/pre-tool-guard-impl.sh` を通すこと。
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

  # .op-env.admin / .op-env.admin.example は Dayopt-Production の service role
  # key を op run で解決する参照 path のみを持ち、実秘密は含まない（#1993）。
  # 読み書き・作成は解禁し、境界は「消費」だけに絞る。消費ブロックは下の Bash
  # 側（--env-file が .op-env.admin 系を指す実行）が担う。ここで Write/Edit を
  # 止めても、agent が中身を書けるだけで production へ到達するわけではない。

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

# --- MCP: レーンからのチップ起票をブロック ---
# チップ起票（spawn_task）は指揮台セッションの専権。レーン（worktree の作業
# セッション）が直接 User へチップを出すと、triage の判断が User へ飛んでしまう。
# レーンは「issue 化 + 指揮台へ send_message」に一本化する
# （.claude/rules/orchestration.md §盤面の正本は issue + open PR、§レーンの連絡規律）。
#
# 判定は「指揮台にいる」ことの allowlist。`.claude/worktrees/` 配下かどうかという
# path の慣習では見ない — 慣習の外に置かれた worktree が main checkout と区別
# できず素通りするため。git の linked worktree かどうかで見る。
#
# 見ているのは **worktree の構造** であって branch ではない。主 clone で feature
# branch を直接 checkout していても「指揮台」と判定する。これは意図的で、
# その状態は `.claude/rules/workflow.md` §main checkout の役割 が既に禁じている
# 別の規律違反であり、このガードの担当範囲ではない。
if [ "$TOOL_NAME" = "mcp__ccd_session__spawn_task" ]; then
  # main checkout では両者が同じ .git を指す。linked worktree では
  # --absolute-git-dir が <main>/.git/worktrees/<name> になる。
  # --git-common-dir は main checkout だと相対（.git）で返るので絶対化して比べる。
  # 「指揮台だと言い切れた時だけ 1」。判定できない場合（git が無い / repo 外 /
  # 解決失敗）はブロックへ倒す。
  guard_is_main_checkout=0
  guard_git_dir=$(git rev-parse --absolute-git-dir 2> /dev/null || true)
  guard_common_dir=$(git rev-parse --git-common-dir 2> /dev/null || true)
  # 空のまま cd に渡さないこと。`cd ""` は bash では成功してカレントに留まるため、
  # 両方が同じ cwd に解決されて「一致＝指揮台」と誤判定する（実測で踏んだ）。
  if [ -n "$guard_git_dir" ] && [ -n "$guard_common_dir" ]; then
    case "$guard_common_dir" in
      /*) ;;
      *) guard_common_dir="$PWD/$guard_common_dir" ;;
    esac
    guard_git_dir=$(cd "$guard_git_dir" 2> /dev/null && pwd -P)
    guard_common_dir=$(cd "$guard_common_dir" 2> /dev/null && pwd -P)
    if [ -n "$guard_git_dir" ] && [ "$guard_git_dir" = "$guard_common_dir" ]; then
      guard_is_main_checkout=1
    fi
  fi
  if [ "$guard_is_main_checkout" -ne 1 ]; then
    echo "BLOCKED: チップ起票（spawn_task）は指揮台セッションの専権です。レーンで別件を見つけたら、(1) dispatch skill の規約に沿って issue を起票し、(2) 指揮台へ send_message で連絡してください。User へ直接チップを出すと triage の判断が User に飛びます（.claude/rules/orchestration.md §レーンの連絡規律）" >&2
    exit 2
  fi
fi

# heredoc 本文の除外は入れない（#1944 は未解決のまま。判断の記録）。
#
# 「heredoc の本文はデータだから危険コマンド検査から外す」は正しい直感だが、
# **どの行が本当に heredoc を開いていて、本文がどこへ行くのかは、shell の
# 引用状態とコマンド位置を解釈しないと決まらない。** 正規表現では決まらない。
# 実装を試み、外部レビュー 3 巡で次の 4 通りの取りこぼしが実測で見つかった。
# いずれも **変更前はブロックできていた形が通るようになる** 方向:
#
#   cat <<EOF | bash                       pipe の先で本文が実行される
#   cat <<EOF > /tmp/x.sh; bash /tmp/x.sh  同じ行の後続コマンドが実行する
#   eval "$(cat <<EOF" / bash <(cat <<EOF  置換の中身が実行される
#   bash -s git <<EOF                      consumer 名が引数で、実際は bash が実行
#   echo "x cat <<EOF" / # cat <<EOF       引用符やコメントの中の << を誤認
#
# 直すたびに次の形が出るのは、判定に必要な情報（引用状態・コマンド位置）が
# 文字列の見た目に無いため。**この class は regex では閉じられない。**
#
# 一方で #1944 が直したかったのは P3 の誤検知で、実害は「コミットメッセージの
# 文面を少し変えれば通る」程度。force-push / reset ガードは agent 自身の逸脱を
# 止めるためのもの（`CLAUDE.md` 由来の禁止）なので、**ブロック側の後退と
# P3 の煩わしさなら、煩わしさを取る。** 誤検知は受け入れて docs に書く。
#
# 実装するなら hook が構造化された入力（argv や AST）を受け取れる層が要る。
# 詳細は #1944 のコメント。

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
  # git push --force (--force-with-lease は許可)
  if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force[^-]|git\s+push\s+.*--force$'; then
    echo "BLOCKED: git push --force は禁止です。--force-with-lease を使ってください（この文字列に言及しただけでも落ちます。commit message や PR 本文に書く時は文面を変えるか、Write / Edit で file に書いてから -F / --body-file で渡してください）" >&2
    exit 2
  fi

  # git reset --hard
  if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
    echo "BLOCKED: git reset --hard は危険です。確認してください（この文字列に言及しただけでも落ちます。文面を変えるか、Write / Edit で file に書いてから渡してください）" >&2
    exit 2
  fi

  # push 前の pause point は .husky/pre-push が担う（git レベルなので
  # Claude / 人間 / wrapper script のすべてに効く）。ここでは
  # その hook を外して push する抜け道だけを塞ぐ。人間が意識的に使うのは
  # 「理由付き override」として許容するが、agent は使わない。
  # コマンド位置（先頭 or セパレータ直後）に限定する。部分一致だと
  # grep / echo で言及しただけで発火してしまう。
  # 行頭 ^ は heredoc 本文の行頭にも一致するため、コミットメッセージにこの
  # 文字列を書いただけでも落ちる（#1944 の誤検知。上のコメントの判断により
  # 受け入れる。文面を変えるか、Write / Edit で file に書いてから渡す）。
  if echo "$COMMAND" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*git[[:space:]]+push[^;&|]*--no-verify'; then
    echo "BLOCKED: git push --no-verify は禁止です。pre-push の pause point に答えてから push してください（heredoc の本文など、この文字列に言及しただけでも落ちます。文面を変えるか、Write / Edit で file に書いてから -F / --body-file で渡してください）" >&2
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
  # ANSI-C / locale 形式の quote（$'…' / $"…"）も shell が引数から取り除く。
  # 導入の $ を落としてから通常の quote 除去に合流させる。これが無いと
  # --env-fi$'le'=… が生の写しにも除去後の写しにも -env-file として現れない。
  guard_sq="'"
  guard_dq='"'
  COMMAND_UNQUOTED=${COMMAND_JOINED//\$$guard_sq/$guard_sq}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\$$guard_dq/$guard_dq}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\"/}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\'/}
  COMMAND_UNQUOTED=${COMMAND_UNQUOTED//\\/}

  for scanned in "$COMMAND_JOINED" "$COMMAND_UNQUOTED"; do
    # 雛形の直接実行。.op-env.admin.example は op://Dayopt-Production/... の参照を
    # そのまま持つため、コピーせず op run に食わせるだけで同じ本番権限が解決される。
    # .op-env.admin 自体も消費すれば同じ権限が解決される（#1993: 作成・書き込みは
    # 解禁したが消費は引き続き禁止。読み書きできることと消費できることは別）。
    #
    # コマンド名ではなく「危険な引数」で判定する。op がコマンド位置に来る形だけを
    # 見ると env / command / 絶対パス / sh -c ... と迂回形をいくらでも作れるため、
    # 位置に依存せず --env-file が admin を指すこと自体を落とす。
    # 下の allowlist でも落ちるが、admin を名指しした時はこちらの具体的な理由を返す。
    if echo "$scanned" | grep -qE '\-\-env-file[=[:space:]]+[^[:space:];&|]*\.op-env\.admin'; then
      echo "BLOCKED: .op-env.admin / .op-env.admin.example を op run に渡すのは User の明示操作に限ります（production の service role key が解決され、admin script が本番へ書き込めるため。読み書きは #1993 で解禁済みだが消費は引き続き禁止）" >&2
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
